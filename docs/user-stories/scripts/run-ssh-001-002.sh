#!/usr/bin/env sh
set -eu

append() {
  printf '%s\n' "$1" >> "$EVIDENCE_FILE"
}

# Preuve actionnable SSH-001 / SSH-002 (VPS vierge)
# Usage:
#   HOST_ALIAS=hermes-ephemeral-01 HOST_IP=203.0.113.12 SSH_IDENTITY="$HOME/.ssh/hermes-console" \
#   SSH_PROVIDER_FINGERPRINT="SHA256:..." \
#   EVIDENCE_FILE="docs/user-stories/evidence/YYYY-MM-DD-ssh-001-002-hermes-ephemeral-01.md" \
#   sh docs/user-stories/scripts/run-ssh-001-002.sh
#
# Options:
#   SSH_SKIP_TUNNEL_TEST=1 : collecte et vérification host-key uniquement (skip test SSH)
#   SSH_USER=hermes-console : utilisateur de connexion SSH pour le test batch

: "${HOST_ALIAS:?missing HOST_ALIAS}"
: "${HOST_IP:?missing HOST_IP}"
: "${SSH_HOST_KEY_PORT:=22}"
: "${SSH_USER:=hermes-console}"
: "${SSH_SKIP_TUNNEL_TEST:=0}"
: "${SSH_IDENTITY:=}"
: "${SSH_PROVIDER_FINGERPRINT:=}"
SAFE_HOST_ALIAS="$(printf '%s' "$HOST_ALIAS" | tr '/ ' '-')"
KNOWN_HOSTS_FILE="$HOME/.ssh/${SAFE_HOST_ALIAS}.known_hosts"
TRACE_DATE_UTC="$(date -u +%FT%TZ)"
TRACE_DATE_LOCAL="$(date -Iseconds)"
: "${EVIDENCE_FILE:=docs/user-stories/evidence/$(date -u +%Y-%m-%d)-ssh-001-002-${SAFE_HOST_ALIAS}.md}"
TEST_RESULT_PENDING="${TEST_RESULT_PENDING:-0}"
mkdir -p "$(dirname "$EVIDENCE_FILE")"

echo "# Preuve — US-G1-SSH-001/002 (auto-run)" > "$EVIDENCE_FILE"
echo "- Date/heure UTC : $TRACE_DATE_UTC" >> "$EVIDENCE_FILE"
echo "- Date/heure locale : $TRACE_DATE_LOCAL" >> "$EVIDENCE_FILE"
echo "- Story : US-G1-SSH-001, US-G1-SSH-002" >> "$EVIDENCE_FILE"
echo "- Cible : $HOST_ALIAS" >> "$EVIDENCE_FILE"
echo "- Host/IP : $HOST_IP:$SSH_HOST_KEY_PORT" >> "$EVIDENCE_FILE"
echo "" >> "$EVIDENCE_FILE"

  if [ "$SSH_SKIP_TUNNEL_TEST" = "1" ]; then
  if [ -n "$SSH_IDENTITY" ]; then
    append "- Test tunnel ignoré (SSH_SKIP_TUNNEL_TEST=1), identité fournie ignorée."
  else
    append "- Test tunnel ignoré (SSH_SKIP_TUNNEL_TEST=1)."
  fi
elif ! [ -f "$SSH_IDENTITY" ]; then
  echo "Identité non trouvée: $SSH_IDENTITY"
  append "- Identité non trouvée: $SSH_IDENTITY"
  exit 1
elif ! [ -r "$SSH_IDENTITY" ]; then
  echo "Identité inaccessible (permission refusée): $SSH_IDENTITY"
  append "- Identité inaccessible (permission refusée): $SSH_IDENTITY"
  exit 1
fi

if ! command -v ssh-keyscan >/dev/null 2>&1; then
  echo "Dependency missing: ssh-keyscan"
  append "- Dependency missing: ssh-keyscan"
  exit 127
fi
if ! command -v ssh-keygen >/dev/null 2>&1; then
  echo "Dependency missing: ssh-keygen"
  append "- Dependency missing: ssh-keygen"
  exit 127
fi
if ! command -v sha256sum >/dev/null 2>&1; then
  echo "Dependency missing: sha256sum"
  append "- Dependency missing: sha256sum"
  exit 127
fi
if ! command -v ssh >/dev/null 2>&1; then
  echo "Dependency missing: ssh"
  append "- Dependency missing: ssh"
  exit 127
fi
if ! command -v mktemp >/dev/null 2>&1; then
  echo "Dependency missing: mktemp"
  append "- Dependency missing: mktemp"
  exit 127
fi

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

TMP_DIR="$(mktemp -d -t hermes-ssh-001-002-XXXXXX)"
TMP_PRE_SCAN="$TMP_DIR/${SAFE_HOST_ALIAS}.hostkey-before"
TMP_PENDING="$TMP_DIR/${SAFE_HOST_ALIAS}.known_hosts.pending"
TMP_SSH_OUT="$TMP_DIR/${SAFE_HOST_ALIAS}.ssh_test.out"
TMP_SSH_ERR="$TMP_DIR/${SAFE_HOST_ALIAS}.ssh_test.err"

cleanup() {
  if [ -n "${TMP_DIR:-}" ]; then
    rm -rf "$TMP_DIR"
  fi
}

on_exit() {
  rc="${1:-0}"
  if [ -n "${EVIDENCE_FILE:-}" ] && [ -f "$EVIDENCE_FILE" ]; then
    if [ "$TEST_RESULT_PENDING" -eq 1 ] && [ "$rc" -eq 0 ]; then
      append "- Résultat global : BLOQUÉ (tunnel non exécuté)"
    elif [ "$rc" -eq 0 ]; then
      append "- Résultat global : SUCCÈS"
    else
      append "- Résultat global : BLOQUÉ (${rc})"
    fi
    echo "- Exécution terminée. Vérifiez manuellement le rapport : $EVIDENCE_FILE" >> "$EVIDENCE_FILE"
  fi
  cleanup
}

trap 'on_exit $?' EXIT HUP INT TERM

echo "## US-G1-SSH-001 / US-G1-SSH-002" >> "$EVIDENCE_FILE"
echo "- Étape 1: pré-écoute host-key (scan)" >> "$EVIDENCE_FILE"
if ! ssh-keyscan -T 5 -p "$SSH_HOST_KEY_PORT" "$HOST_IP" > "$TMP_PRE_SCAN"; then
  echo "Échec ssh-keyscan initial"
  echo "- Échec de la pré-écoute host-key (ssh-keyscan initial)." >> "$EVIDENCE_FILE"
  exit 1
fi
ssh-keygen -l -f "$TMP_PRE_SCAN" | sed 's/^/- /' >> "$EVIDENCE_FILE"

echo "- Étape 2: collecte host-key officielle (hors bande)" >> "$EVIDENCE_FILE"
if ! ssh-keyscan -T 5 -p "$SSH_HOST_KEY_PORT" "$HOST_IP" > "$TMP_PENDING"; then
  echo "Échec ssh-keyscan officiel"
  echo "- Échec de la collecte hôte officielle (ssh-keyscan)."
  echo "- Échec de la collecte hôte officielle (ssh-keyscan)." >> "$EVIDENCE_FILE"
  exit 1
fi
# ssh-keyscan renvoie les clés d'hôte dans un ordre non déterministe (scan concurrent).
# On compare donc l'empreinte fournisseur à TOUTES les clés scannées, jamais à la première.
SCAN_ALL="$(ssh-keygen -lf "$TMP_PENDING")"
SCAN_HASH="$(sha256sum "$TMP_PENDING" | awk '{print $1}')"

if [ -z "$SCAN_ALL" ]; then
  echo "- Empreinte hôte introuvable dans la sortie ssh-keygen."
  echo "- Empreinte hôte introuvable dans la sortie ssh-keygen." >> "$EVIDENCE_FILE"
  exit 1
fi

echo "- SHA256 du fichier scan : $SCAN_HASH" >> "$EVIDENCE_FILE"
echo "- Empreintes scannées (toutes les clés d'hôte) :" >> "$EVIDENCE_FILE"
printf '%s\n' "$SCAN_ALL" | sed 's/^/  - /' >> "$EVIDENCE_FILE"

if [ -n "$SSH_PROVIDER_FINGERPRINT" ]; then
  echo "- Empreinte fournisseur attendue : $SSH_PROVIDER_FINGERPRINT" >> "$EVIDENCE_FILE"
  MATCH_LINE="$(printf '%s\n' "$SCAN_ALL" | awk -v fp="$SSH_PROVIDER_FINGERPRINT" '$2 == fp {print; exit}')"
  if [ -z "$MATCH_LINE" ]; then
    echo "- Refus strict: aucune clé d'hôte scannée ne correspond à l'empreinte fournisseur." >> "$EVIDENCE_FILE"
    echo "Refus strict: aucune clé d'hôte scannée ne correspond à l'empreinte fournisseur (abort)"
    exit 1
  fi
  echo "- Concordance stricte sur : $MATCH_LINE" >> "$EVIDENCE_FILE"
  UNVERIFIED="$(printf '%s\n' "$SCAN_ALL" | awk -v fp="$SSH_PROVIDER_FINGERPRINT" '$2 != fp {print}')"
  if [ -n "$UNVERIFIED" ]; then
    echo "- Clés d'hôte présentes dans known_hosts mais NON vérifiées hors bande :" >> "$EVIDENCE_FILE"
    printf '%s\n' "$UNVERIFIED" | sed 's/^/  - /' >> "$EVIDENCE_FILE"
    echo "  (fournir l'empreinte fournisseur de chaque type pour une vérification complète)" >> "$EVIDENCE_FILE"
  fi
else
  echo "- Vérification manuelle de l'empreinte attendue à effectuer sur source fournisseur." >> "$EVIDENCE_FILE"
fi

append "- known_hosts dédié généré localement (ligne complète masquée)."
mv "$TMP_PENDING" "$KNOWN_HOSTS_FILE"
chmod 600 "$KNOWN_HOSTS_FILE"
append "- known_hosts final à l'hôte: $KNOWN_HOSTS_FILE"

if [ "$SSH_SKIP_TUNNEL_TEST" = "1" ]; then
  append "- Étape 3: test tunnel batch sauté (SSH_SKIP_TUNNEL_TEST=1)."
  TEST_RESULT_PENDING=1
else
  append "- Étape 3: acceptation stricte et test tunnel batch (si clé disponible)"

  if ssh -F /dev/null \
    -o BatchMode=yes \
    -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=yes \
    -o ConnectTimeout=10 \
    -o UserKnownHostsFile="$KNOWN_HOSTS_FILE" \
    -i "$SSH_IDENTITY" \
    -p "$SSH_HOST_KEY_PORT" \
    "${SSH_USER}@${HOST_IP}" "id -un && id -g && umask" \
      >"$TMP_SSH_OUT" \
      2>"$TMP_SSH_ERR"
  then
    append "- Test tunnel batch OK (code 0)."
    sed "s/^/  - /" "$TMP_SSH_OUT" >> "$EVIDENCE_FILE"
  else
    TEST_CODE=$?
    append "- Test tunnel batch FAIL (code ${TEST_CODE})."
    append "- Erreur SSH :"
    sed "s/^/  - /" "$TMP_SSH_ERR" >> "$EVIDENCE_FILE" || true
    exit "$TEST_CODE"
  fi
fi
