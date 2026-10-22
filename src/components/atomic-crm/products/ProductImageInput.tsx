import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useNotify } from "ra-core";
import { ImagePlus } from "lucide-react";
import { TextInput } from "@/components/admin/text-input";
import { Button } from "@/components/ui/button";

import { getSupabaseClient } from "../providers/supabase/supabase";

const BUCKET = "product-images";
const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

// Attach a photo from the device. The file goes to the public product-images bucket and
// its address is written into image_url, so the listing and Facebook posts use it.
// The URL field below stays for photos already hosted elsewhere.
export const ProductImageInput = () => {
  const notify = useNotify();
  const { setValue } = useFormContext();
  const imageUrl = useWatch({ name: "image_url" }) as string | undefined;
  const [uploading, setUploading] = useState(false);

  const attach = async (file: File) => {
    if (!TYPES.includes(file.type)) {
      notify("Choose a JPEG, PNG or WebP photo.", { type: "error" });
      return;
    }
    if (file.size > MAX_BYTES) {
      notify("Photos must be 8 MB or smaller.", { type: "error" });
      return;
    }
    setUploading(true);
    const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `${crypto.randomUUID()}/${safe}`;
    const client = getSupabaseClient();
    const { error } = await client.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (error) {
      notify("The photo could not be uploaded.", { type: "error" });
      return;
    }
    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    setValue("image_url", data.publicUrl, { shouldDirty: true });
    notify("Photo attached");
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium">Photo</span>
      <div className="flex flex-wrap items-center gap-3">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="size-20 rounded-md border object-cover"
          />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-md border border-dashed text-muted-foreground">
            <ImagePlus className="size-6" />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Button asChild variant="outline" disabled={uploading}>
            <label htmlFor="product-photo" className="cursor-pointer">
              {uploading ? "Uploading…" : "Choose a photo"}
            </label>
          </Button>
          <input
            id="product-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void attach(file);
            }}
          />
          <p className="text-xs text-muted-foreground">
            JPEG, PNG or WebP, up to 8 MB.
          </p>
        </div>
      </div>
      <TextInput
        source="image_url"
        label="Or paste an image address"
        helperText={false}
      />
    </div>
  );
};
