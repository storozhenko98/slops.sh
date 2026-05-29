export const INSTALL_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

repo="storozhenko98/slops.sh"
tag="latest"
install_dir="\${SLOPS_INSTALL_DIR:-$HOME/.local/bin}"
bin_path="$install_dir/slops"

case "$(uname -s)" in
  Darwin) os="macos" ;;
  Linux) os="linux" ;;
  *)
    echo "unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64) arch="x64" ;;
  *)
    echo "unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

asset="slops-$os-$arch"

if [ "$asset" = "slops-linux-arm64" ]; then
  echo "linux arm64 builds are not published yet" >&2
  exit 1
fi

url="https://github.com/$repo/releases/download/$tag/$asset"
checksum_url="$url.sha256"
tmp="$(mktemp "\${TMPDIR:-/tmp}/slops.XXXXXX")"
tmp_sum="$tmp.sha256"

cleanup() {
  rm -f "$tmp" "$tmp_sum"
}
trap cleanup EXIT

echo "downloading $asset from GitHub releases"
curl -fsSL "$url" -o "$tmp"

if command -v sha256sum >/dev/null 2>&1; then
  curl -fsSL "$checksum_url" -o "$tmp_sum"
  (cd "$(dirname "$tmp")" && cp "$tmp" "$asset" && sha256sum -c "$tmp_sum" && rm -f "$asset")
elif command -v shasum >/dev/null 2>&1; then
  expected="$(curl -fsSL "$checksum_url" | awk '{print $1}')"
  actual="$(shasum -a 256 "$tmp" | awk '{print $1}')"
  if [ "$expected" != "$actual" ]; then
    echo "checksum mismatch" >&2
    exit 1
  fi
else
  echo "warning: no sha256 checker found; skipping checksum verification" >&2
fi

mkdir -p "$install_dir"
chmod +x "$tmp"
mv "$tmp" "$bin_path"

echo "installed slops to $bin_path"

case ":$PATH:" in
  *":$install_dir:"*) ;;
  *)
    echo "add $install_dir to PATH, or run:"
    echo "  $bin_path"
    ;;
esac
`;
