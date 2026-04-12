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

fn build_payload(format: &WebhookFormat, event: &str, body: &str) -> serde_json::Value {
    match format {
        WebhookFormat::Discord => json!({
            "content": format!("**LumiCode** | {} — {}", event, body)
        }),
        WebhookFormat::Slack => json!({
            "text": format!("*LumiCode* | {} — {}", event, body)
        }),
        WebhookFormat::HomeAssistant => json!({
            "event": event,
            "source": "lumicode",
            "message": body
        }),
        WebhookFormat::Generic => json!({
            "event": event,
            "message": body,
            "app": "lumicode"
        }),
    }
}
