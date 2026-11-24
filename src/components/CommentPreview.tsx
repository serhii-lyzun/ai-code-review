type CommentPreviewProps = Readonly<{
  text: string
}>

// Lightweight formatting for comment previews: **bold**, _italic_ and line breaks.
function toHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/\n/g, '<br />')
}

function CommentPreview({ text }: CommentPreviewProps) {
  return (
    <div
      className="comment-preview"
      dangerouslySetInnerHTML={{ __html: toHtml(text) }}
    />
  )
}

export default CommentPreview
