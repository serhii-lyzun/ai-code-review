import { render, screen } from '@testing-library/react'
import CommentPreview from './CommentPreview.tsx'

describe('CommentPreview', () => {
  it('renders bold text', () => {
    render(<CommentPreview text="this is **important**" />)
    expect(screen.getByText('important').tagName).toBe('STRONG')
  })

  it('renders italic text', () => {
    render(<CommentPreview text="this is _subtle_" />)
    expect(screen.getByText('subtle').tagName).toBe('EM')
  })

  it('keeps plain text as is', () => {
    render(<CommentPreview text="hello" />)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })
})
