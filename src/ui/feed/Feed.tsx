import type { TicketRequest } from '../../tickets/types'
import { Glossed } from '../glossary/Glossed'
import type { Segment } from '../glossary/terms'

export interface FeedMessage { from: string; text: string }

/**
 * The communications feed for one case, oldest first. Every message comes from the
 * ticket fixture: the sender's request, then each attached piece of evidence.
 */
export function feedFor(request: TicketRequest): FeedMessage[] {
  return [
    { from: request.sender, text: `${request.needs} Business impact: ${request.impact}` },
    ...request.evidence.map((text) => ({ from: 'Attached evidence', text })),
  ]
}

export default function Feed({ messages, segments }: { messages: FeedMessage[]; segments?: Segment[][] }) {
  return <section className="feed" aria-labelledby="feed-title">
    <h2 id="feed-title" className="label">Messages</h2>
    <ol className="feed-list">
      {messages.map((message, index) => <li key={index} className="feed-item">
        <span className="feed-from">{message.from}</span>
        <p>{segments?.[index] ? <Glossed segments={segments[index]} /> : message.text}</p>
      </li>)}
    </ol>
  </section>
}
