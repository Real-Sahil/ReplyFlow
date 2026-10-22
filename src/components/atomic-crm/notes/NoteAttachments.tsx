import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";

import { ATTACHMENTS_BUCKET } from "../providers/commons/attachments";
import { getSupabaseClient } from "../providers/supabase/supabase";
import type { AttachmentNote, ContactNote, DealNote } from "../types";

/** How long a signed attachment link stays valid, in seconds. */
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Resolves a link the browser can open for an attachment.
 *
 * The attachments bucket is private, so a stored file is opened through a
 * short-lived signed link created for the signed-in user. Attachments without a
 * storage path (demo data, files hosted elsewhere) keep their own `src`.
 *
 * @param attachment - The attachment to open.
 * @returns The URL to use, or `undefined` while a signed link is being created or if it failed.
 */
const useAttachmentUrl = (attachment: AttachmentNote): string | undefined => {
  const [url, setUrl] = useState<string | undefined>(
    attachment.path ? undefined : attachment.src,
  );

  useEffect(() => {
    if (!attachment.path) {
      setUrl(attachment.src);
      return;
    }
    let cancelled = false;
    getSupabaseClient()
      .storage.from(ATTACHMENTS_BUCKET)
      .createSignedUrl(attachment.path, SIGNED_URL_TTL_SECONDS)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.path, attachment.src]);

  return url;
};

const ImageAttachment = ({ attachment }: { attachment: AttachmentNote }) => {
  const url = useAttachmentUrl(attachment);
  return (
    <a
      href={url}
      title={attachment.title}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
      onClick={(e) => e.stopPropagation()}
    >
      <img
        src={url}
        alt={attachment.title}
        className="w-[200px] h-[100px] object-cover cursor-pointer object-left border border-border"
      />
    </a>
  );
};

const FileAttachment = ({ attachment }: { attachment: AttachmentNote }) => {
  const url = useAttachmentUrl(attachment);
  return (
    <div className="flex items-center gap-2">
      <Paperclip className="w-4 h-4" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:no-underline"
        onClick={(e) => e.stopPropagation()}
      >
        {attachment.title}
      </a>
    </div>
  );
};

/**
 * Displays persisted note attachments in note show/list views.
 *
 * This component receives a full note record and renders all attachments.
 *
 * @param props.note - Note record containing attachments to render.
 * @returns `null` when there are no attachments, otherwise attachment previews and links.
 */
export const NoteAttachments = ({ note }: { note: ContactNote | DealNote }) => {
  if (!note.attachments || note.attachments.length === 0) {
    return null;
  }

  const imageAttachments = note.attachments.filter(
    (attachment: AttachmentNote) => isImageMimeType(attachment.type),
  );
  const otherAttachments = note.attachments.filter(
    (attachment: AttachmentNote) => !isImageMimeType(attachment.type),
  );

  return (
    <div className="mt-2 flex flex-col gap-2">
      {imageAttachments.length > 0 && (
        <div className="grid grid-cols-4 gap-8">
          {imageAttachments.map((attachment: AttachmentNote, index: number) => (
            <div key={index}>
              <ImageAttachment attachment={attachment} />
            </div>
          ))}
        </div>
      )}
      {otherAttachments.length > 0 &&
        otherAttachments.map((attachment: AttachmentNote, index: number) => (
          <FileAttachment key={index} attachment={attachment} />
        ))}
    </div>
  );
};

/**
 * Checks whether a mime type corresponds to an image.
 *
 * @param mimeType - The attachment mime type.
 * @returns `true` when the mime type starts with `image/`.
 */
const isImageMimeType = (mimeType?: string): boolean => {
  if (!mimeType) {
    return false;
  }
  return mimeType.startsWith("image/");
};
