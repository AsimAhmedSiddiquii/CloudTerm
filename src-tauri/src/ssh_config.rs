use std::fs;
use std::path::PathBuf;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigEntry {
    pub alias: String,
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub identity_files: Vec<String>,
}

#[derive(Default)]
struct HostOptions {
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    identity_files: Vec<String>,
}

fn config_path() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))?;
    Some(PathBuf::from(home).join(".ssh").join("config"))
}

fn expand_home(value: &str) -> String {
    if value == "~" || value.starts_with("~/") || value.starts_with("~\\") {
        if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
            return format!("{}{}", PathBuf::from(home).display(), &value[1..]);
        }
    }
    value.to_owned()
}

fn flush_hosts(
    aliases: &[String],
    options: &HostOptions,
    entries: &mut Vec<SshConfigEntry>,
) {
    let Some(host) = options.host.as_deref().filter(|host| !host.is_empty()) else {
        return;
    };

    for alias in aliases {
        if alias.contains('*') || alias.contains('?') || alias.starts_with('!') {
            continue;
        }
        entries.push(SshConfigEntry {
            alias: alias.clone(),
            host: host.to_owned(),
            port: options.port.unwrap_or(22),
            username: options.username.clone(),
            identity_files: options.identity_files.clone(),
        });
    }
}

pub fn parse_config(contents: &str) -> Vec<SshConfigEntry> {
    let mut entries = Vec::new();
    let mut aliases = Vec::new();
    let mut options = HostOptions::default();

    for line in contents.lines() {
        let line = line.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split_whitespace();
        let Some(directive) = parts.next() else { continue };
        let value = parts.collect::<Vec<_>>().join(" ");

        if directive.eq_ignore_ascii_case("host") {
            flush_hosts(&aliases, &options, &mut entries);
            aliases = value.split_whitespace().map(str::to_owned).collect();
            options = HostOptions::default();
            continue;
        }

        match directive.to_ascii_lowercase().as_str() {
            "hostname" => options.host = Some(value),
            "port" => options.port = value.parse().ok(),
            "user" => options.username = Some(value),
            "identityfile" => options.identity_files.push(expand_home(&value)),
            _ => {}
        }
    }

    flush_hosts(&aliases, &options, &mut entries);
    entries
}

pub fn list_entries() -> Result<Vec<SshConfigEntry>, anyhow::Error> {
    let Some(path) = config_path() else { return Ok(Vec::new()) };
    if !path.exists() {
        return Ok(Vec::new());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| anyhow::anyhow!("Unable to read {}: {error}", path.display()))?;
    Ok(parse_config(&contents))
}

#[cfg(test)]
mod tests {
    use super::parse_config;

    #[test]
    fn parses_supported_host_options_and_skips_wildcards() {
        let entries = parse_config(
            "Host production\n HostName 203.0.113.10\n User ubuntu\n Port 2222\n IdentityFile ~/.ssh/prod.pem\n\nHost *\n User ignored\n",
        );

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].alias, "production");
        assert_eq!(entries[0].host, "203.0.113.10");
        assert_eq!(entries[0].port, 2222);
        assert_eq!(entries[0].username.as_deref(), Some("ubuntu"));
        assert!(entries[0].identity_files[0].ends_with(".ssh\\prod.pem") || entries[0].identity_files[0].ends_with(".ssh/prod.pem"));
    }
}
