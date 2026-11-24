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

  it('renders line breaks', () => {
    const { container } = render(<CommentPreview text={'first\nsecond'} />)
    expect(container.querySelectorAll('br')).toHaveLength(1)
    expect(container).toHaveTextContent('firstsecond')
  })

  it('shows HTML as literal text instead of rendering it', () => {
    const { container } = render(
      <CommentPreview text={'<img src=x onerror="alert(1)"><b>hi</b>'} />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container).toHaveTextContent(
      '<img src=x onerror="alert(1)"><b>hi</b>',
    )
  })

  it('escapes HTML inside formatting markers', () => {
    const { container } = render(
      <CommentPreview text="**<script>alert(1)</script>**" />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('strong')).toHaveTextContent(
      '<script>alert(1)</script>',
    )
  })

  it('leaves underscores inside words alone', () => {
    const { container } = render(
      <CommentPreview text="set my_config_file and see https://x.com/a_b_c" />,
    )
    expect(container.querySelector('em')).toBeNull()
    expect(container).toHaveTextContent(
      'set my_config_file and see https://x.com/a_b_c',
    )
  })
})
