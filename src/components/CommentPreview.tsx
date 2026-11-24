import { Fragment, type ReactNode } from 'react'

type CommentPreviewProps = Readonly<{
  text: string
}>

// `**bold**`, or `_italic_` when the underscores aren't inside a word, in any
// script (so snake_case identifiers and URLs stay as typed). The capture
// group makes `split` keep the matches at odd indices.
const FORMATTING =
  /(\*\*[^*\n]+\*\*|(?<![\p{L}\p{N}_])_[^_\n]+_(?![\p{L}\p{N}_]))/u

function formatLine(line: string): ReactNode[] {
  return line.split(FORMATTING).map((part, index) => {
    if (index % 2 === 0) return part
    return part.startsWith('**') ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      <em key={index}>{part.slice(1, -1)}</em>
    )
  })
}

/**
 * Live preview of a user's comment with `**bold**`, `_italic_` and line
 * breaks. Builds React elements, never an HTML string, so any markup in the
 * text is shown as text and escaped by React.
 */
function CommentPreview({ text }: CommentPreviewProps) {
  return (
    <div>
      {text.split('\n').map((line, index) => (
        <Fragment key={index}>
          {index > 0 && <br />}
          {formatLine(line)}
        </Fragment>
      ))}
    </div>
  )
}

export default CommentPreview
