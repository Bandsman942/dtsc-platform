import { downloadPublicPublicationImageFromSupabase } from "@/lib/supabase-storage";

type Params = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, { params }: Params) {
  const { path } = await params;
  const storagePath = path.join("/");
  const hasVersionQuery = new URL(req.url).searchParams.has("v");

  if (!storagePath.startsWith("publications/")) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const image = await downloadPublicPublicationImageFromSupabase(storagePath);
    return new Response(image, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-DTSC-Asset-Versioned": hasVersionQuery ? "1" : "0",
        "Content-Type": image.type || "image/webp",
      },
    });
  } catch (error) {
    console.error("Public publication image download failed", error);
    return new Response("Not found", { status: 404 });
  }
}
