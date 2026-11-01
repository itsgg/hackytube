import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Linkified } from './Watch'

const html = (text: string) => renderToStaticMarkup(<Linkified text={text} />)

describe('Linkified', () => {
  it('turns URLs in comments into safe external links', () => {
    const out = html('See https://example.org/talk?id=1. Great.')
    expect(out).toContain('href="https://example.org/talk?id=1"')
    expect(out).toContain('rel="noopener noreferrer nofollow"')
    expect(out).toMatch(/<\/a>\. Great\.$/) // trailing punctuation stays outside the link
  })
  it('escapes everything that is not a link', () => {
    expect(html('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
  it('does not linkify javascript: or bare words', () => {
    expect(html('javascript:alert(1) and example.org')).not.toContain('<a')
  })
})
