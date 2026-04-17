use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheckResult {
    pub current: String,
    pub latest: Option<String>,
    pub update_available: bool,
    pub release_url: Option<String>,
    pub message: String,
}

/// Query GitHub Releases for the latest tag and compare to the current
/// binary's compile-time version. On-demand only — never called
/// automatically, never downloads anything, just reports.
pub async fn check(current: &str, repo: &str) -> Result<UpdateCheckResult, String> {
    let repo = repo.trim();
    if repo.is_empty() {
        return Ok(UpdateCheckResult {
            current: current.to_string(),
            latest: None,
            update_available: false,
            release_url: None,
            message: "Update check not configured — set 'GitHub repo' in Settings to enable."
                .to_string(),
        });
    }
    if !repo.contains('/') {
        return Err(format!(
            "Invalid repo '{}' — must be in 'owner/name' form",
            repo
        ));
    }

    let url = format!("https://api.github.com/repos/{}/releases/latest", repo);
    let client = reqwest::Client::builder()
        .user_agent(format!("LumiCode/{}", current))
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "GitHub API returned HTTP {} — is '{}' a public repo with a published release?",
            resp.status().as_u16(),
            repo
        ));
    }

    #[derive(Deserialize)]
    struct GhRelease {
        tag_name: String,
        html_url: Option<String>,
    }

    let release: GhRelease = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

    let latest = normalize_tag(&release.tag_name);
    let update_available = is_newer(&latest, current);

    let message = if update_available {
        format!("New version available: {} (you have {})", latest, current)
    } else {
        format!("You're up to date ({})", current)
    };

    Ok(UpdateCheckResult {
        current: current.to_string(),
        latest: Some(latest),
        update_available,
        release_url: release.html_url,
        message,
    })
}

/// Strip a leading 'v' or 'V' from a tag so "v1.7.0" and "1.7.0" compare equal.
fn normalize_tag(tag: &str) -> String {
    let t = tag.trim();
    t.strip_prefix('v')
        .or_else(|| t.strip_prefix('V'))
        .unwrap_or(t)
        .to_string()
}

/// Dead-simple semver-ish comparison: splits on '.', parses each segment as
/// a number, compares lexicographically. Handles common "x.y.z" tags; a
/// malformed tag falls back to string comparison.
fn is_newer(latest: &str, current: &str) -> bool {
    let parse = |s: &str| -> Vec<u64> {
        s.split('.')
            .map(|seg| {
                seg.chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect::<String>()
            })
            .map(|num| num.parse::<u64>().unwrap_or(0))
            .collect()
    };
    let l = parse(latest);
    let c = parse(current);
    for i in 0..l.len().max(c.len()) {
        let lv = l.get(i).copied().unwrap_or(0);
        let cv = c.get(i).copied().unwrap_or(0);
        if lv > cv {
            return true;
        }
        if lv < cv {
            return false;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_v_prefix() {
        assert_eq!(normalize_tag("v1.2.3"), "1.2.3");
        assert_eq!(normalize_tag("V1.2.3"), "1.2.3");
        assert_eq!(normalize_tag("1.2.3"), "1.2.3");
        assert_eq!(normalize_tag("  v2.0  "), "2.0");
    }

    #[test]
    fn is_newer_simple() {
        assert!(is_newer("1.7.1", "1.7.0"));
        assert!(is_newer("2.0.0", "1.9.9"));
        assert!(!is_newer("1.7.0", "1.7.0"));
        assert!(!is_newer("1.7.0", "1.7.1"));
        assert!(!is_newer("1.6.99", "1.7.0"));
    }

    #[test]
    fn is_newer_handles_length_mismatch() {
        assert!(is_newer("1.7.0.1", "1.7.0"));
        assert!(!is_newer("1.7", "1.7.0"));
    }

    #[test]
    fn is_newer_handles_prerelease_suffix() {
        // "1.7.1-beta" → segments ["1", "7", "1"] after digit-only parse
        assert!(is_newer("1.7.1-beta", "1.7.0"));
    }
}
