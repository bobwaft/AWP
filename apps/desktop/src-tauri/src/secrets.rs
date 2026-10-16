//! OS keychain access. Keys are namespaced `awp/<service>/<account>`.
//! Only names (never values) are written to disk, in app-data `accounts.json`.
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SERVICE: &str = "awp";

fn valid(part: &str) -> bool {
    !part.is_empty()
        && part.len() <= 64
        && part
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

pub fn key(service: &str, account: &str) -> Result<String, String> {
    if valid(service) && valid(account) {
        Ok(format!("awp/{service}/{account}"))
    } else {
        Err("invalid service or account name".into())
    }
}

fn entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

/// Used by the engine callback (`secret.get`); not exposed to the webview.
pub fn get(key: &str) -> Result<Option<String>, String> {
    if !key.starts_with("awp/") {
        return Err("key outside awp/ namespace".into());
    }
    match entry(key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("accounts.json"))
}

fn read_index(app: &AppHandle) -> Vec<String> {
    index_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_index(app: &AppHandle, names: &[String]) -> Result<(), String> {
    let json = serde_json::to_string(names).map_err(|e| e.to_string())?;
    std::fs::write(index_path(app)?, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_set(
    app: AppHandle,
    service: String,
    account: String,
    value: String,
) -> Result<(), String> {
    let k = key(&service, &account)?;
    entry(&k)?.set_password(&value).map_err(|e| e.to_string())?;
    let mut names = read_index(&app);
    if !names.contains(&k) {
        names.push(k);
        write_index(&app, &names)?;
    }
    Ok(())
}

#[tauri::command]
pub fn secret_delete(app: AppHandle, service: String, account: String) -> Result<(), String> {
    let k = key(&service, &account)?;
    match entry(&k)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(e.to_string()),
    }
    let mut names = read_index(&app);
    names.retain(|n| n != &k);
    write_index(&app, &names)
}

/// Connected token names (`awp/<service>/<account>`), without values.
#[tauri::command]
pub fn accounts_list(app: AppHandle) -> Vec<String> {
    read_index(&app)
        .into_iter()
        .filter(|k| matches!(get(k), Ok(Some(_))))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_are_namespaced_and_validated() {
        assert_eq!(key("figma", "default").unwrap(), "awp/figma/default");
        assert!(key("fi/gma", "x").is_err());
        assert!(key("", "x").is_err());
        assert!(key("a b", "x").is_err());
    }

    #[test]
    fn keychain_round_trip() {
        let k = "awp/test/roundtrip";
        let e = entry(k).unwrap();
        if e.set_password("s3cret").is_err() {
            eprintln!("no keychain backend available; skipping");
            return;
        }
        assert_eq!(get(k).unwrap().as_deref(), Some("s3cret"));
        e.delete_credential().unwrap();
        assert_eq!(get(k).unwrap(), None);
    }

    #[test]
    fn get_rejects_foreign_keys() {
        assert!(get("other/thing").is_err());
    }
}
