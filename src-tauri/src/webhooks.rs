use crate::config::{WebhookConfig, WebhookFormat};
use serde_json::json;

pub async fn forward_event(webhooks: &[WebhookConfig], event: &str, body: &str) {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(_) => return,
    };

    for webhook in webhooks {
        if !webhook.enabled || webhook.url.is_empty() {
            continue;
        }

        let payload = build_payload(&webhook.format, event, body);

        let url = webhook.url.clone();
        let client = client.clone();
        // Fire with one retry on failure
        tokio::spawn(async move {
            let result = client.post(&url).json(&payload).send().await;
            if result.is_err() || result.as_ref().is_ok_and(|r| r.status().is_server_error()) {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                let _ = client.post(&url).json(&payload).send().await;
            }
        });
    }
}

pub async fn send_test(url: &str, format: &str) -> Result<String, String> {
    let wh_format = match format {
        "discord" => WebhookFormat::Discord,
        "slack" => WebhookFormat::Slack,
        "homeassistant" => WebhookFormat::HomeAssistant,
        _ => WebhookFormat::Generic,
    };

    let payload = build_payload(&wh_format, "done", "Test event from LumiCode");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let resp = client
        .post(url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = resp.status();
    if status.is_success() {
        Ok(format!("OK ({})", status.as_u16()))
    } else {
        Err(format!("HTTP {}", status.as_u16()))
    }
}

/// Event visuals reused by all rich formats.
fn event_meta(event: &str) -> (u32, &'static str, &'static str) {
    // (hex color, emoji, human label)
    match event {
        "working" => (0xfbbf24, "⚙️", "Working"),
        "done" => (0x4ade80, "✅", "Done"),
        "error" => (0xf87171, "❌", "Error"),
        "thinking" => (0xa78bfa, "💭", "Thinking"),
        "idle" => (0x9ca3af, "💤", "Idle"),
        _ => (0x6366f1, "📡", "Event"),
    }
}

fn hex_color(c: u32) -> String {
    format!("#{:06x}", c)
}

fn build_payload(format: &WebhookFormat, event: &str, body: &str) -> serde_json::Value {
    let (color, emoji, label) = event_meta(event);
    let timestamp = chrono::Utc::now().to_rfc3339();

    match format {
        // Discord: rich embed with color-coded left border and timestamp.
        // https://discord.com/developers/docs/resources/channel#embed-object
        WebhookFormat::Discord => json!({
            "username": "LumiCode",
            "embeds": [{
                "title": format!("{} {}", emoji, label),
                "description": body,
                "color": color,
                "timestamp": timestamp,
                "footer": { "text": "LumiCode" }
            }]
        }),
        // Slack: attachment with color bar for legacy, blocks for rich layout.
        // https://api.slack.com/reference/messaging/attachments
        WebhookFormat::Slack => json!({
            "text": format!("{} LumiCode — {}", emoji, label),
            "attachments": [{
                "color": hex_color(color),
                "blocks": [
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": format!("*{} {}*\n{}", emoji, label, body)
                        }
                    },
                    {
                        "type": "context",
                        "elements": [
                            { "type": "mrkdwn", "text": format!("LumiCode · <!date^{}^{{date_short_pretty}} {{time}}|{}>",
                                chrono::Utc::now().timestamp(), timestamp) }
                        ]
                    }
                ]
            }]
        }),
        WebhookFormat::HomeAssistant => json!({
            "event": event,
            "source": "lumicode",
            "message": body,
            "label": label,
            "color": hex_color(color),
            "timestamp": timestamp,
        }),
        WebhookFormat::Generic => json!({
            "event": event,
            "message": body,
            "app": "lumicode",
            "label": label,
            "color": hex_color(color),
            "timestamp": timestamp,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discord_payload_has_embed_with_color() {
        let p = build_payload(&WebhookFormat::Discord, "error", "oops");
        let embed = &p["embeds"][0];
        assert_eq!(embed["color"], 0xf87171);
        assert!(embed["title"].as_str().unwrap().contains("Error"));
        assert_eq!(embed["description"], "oops");
    }

    #[test]
    fn slack_payload_has_colored_attachment() {
        let p = build_payload(&WebhookFormat::Slack, "done", "finished");
        assert_eq!(p["attachments"][0]["color"], "#4ade80");
    }

    #[test]
    fn generic_payload_includes_metadata() {
        let p = build_payload(&WebhookFormat::Generic, "working", "running tests");
        assert_eq!(p["event"], "working");
        assert_eq!(p["label"], "Working");
        assert_eq!(p["color"], "#fbbf24");
        assert_eq!(p["app"], "lumicode");
    }

    #[test]
    fn unknown_event_falls_back() {
        let p = build_payload(&WebhookFormat::Discord, "weird", "x");
        assert_eq!(p["embeds"][0]["color"], 0x6366f1);
    }
}
