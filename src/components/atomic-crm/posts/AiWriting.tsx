// A label that shows the AI is working on a caption. It shimmers while it waits,
// and is still readable when motion is reduced (see .ai-shimmer in index.css).
export const AiWriting = ({ label }: { label: string }) => (
  <span role="status" aria-live="polite" className="ai-shimmer">
    {label}
  </span>
);
