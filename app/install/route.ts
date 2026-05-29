import { INSTALL_SCRIPT } from "@/lib/install-script";

export function GET() {
  return new Response(INSTALL_SCRIPT, {
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
