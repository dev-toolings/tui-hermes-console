#!/bin/sh

valid_cli_provider() {
  [ "$#" -eq 1 ] || return 1
  [ -n "$1" ] && [ "${#1}" -le 80 ] || return 1
  case "$1" in *[!a-z0-9_-]*) return 1 ;; esac
}

valid_cli_index() {
  [ "$#" -eq 1 ] || return 1
  case "$1" in ''|*[!0-9]*) return 1 ;; esac
}

valid_console_label() {
  [ "$#" -eq 1 ] || return 1
  case "$1" in
    console-web-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) return 0 ;;
    *) return 1 ;;
  esac
}

is_console_managed_credential() {
  [ "$#" -eq 2 ] || return 1
  credential_inventory=$1
  credential_index=$2
  valid_cli_index "$credential_index" || return 1
  printf '%s\n' "$credential_inventory" | grep -Eq \
    "^[[:space:]]*#${credential_index}[[:space:]]+console-web-[0-9a-f]{12}[[:space:]]+api_key[[:space:]]+manual([[:space:]]|$)"
}

validate_cli_arguments() {
  case "${1:-}" in
    --version)
      [ "$#" -eq 1 ]
      ;;
    auth)
      case "${2:-}" in
        list)
          [ "$#" -eq 3 ] && valid_cli_provider "$3"
          ;;
        add)
          if [ "$#" -eq 4 ] && [ "$3" = openai-codex ] && [ "$4" = --no-browser ]; then
            return 0
          fi
          [ "$#" -eq 7 ] &&
            valid_cli_provider "$3" &&
            [ "$4" = --type ] &&
            [ "$5" = api-key ] &&
            [ "$6" = --label ] &&
            valid_console_label "$7"
          ;;
        remove)
          [ "$#" -eq 4 ] && valid_cli_provider "$3" && valid_cli_index "$4"
          ;;
        *) return 1 ;;
      esac
      ;;
    config)
      [ "$#" -eq 3 ] && [ "$2" = get ] && [ "$3" = terminal.cwd ]
      ;;
    gateway)
      [ "$#" -eq 2 ] && [ "$2" = restart ]
      ;;
    dashboard)
      [ "$#" -eq 2 ] && [ "$2" = --stop ]
      ;;
    *) return 1 ;;
  esac
}
