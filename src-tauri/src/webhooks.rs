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

        let payload = match webhook.format {
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
        };

        let url = webhook.url.clone();
        let client = client.clone();
        // Fire and forget each webhook
        tokio::spawn(async move {
            let _ = client.post(&url).json(&payload).send().await;
        });
    }
}
