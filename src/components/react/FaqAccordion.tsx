export interface FaqItemData {
  q: string;
  a: string;
}

interface Props {
  title: string;
  items: FaqItemData[];
}

/**
 * Reusable FAQ accordion using native <details>/<summary> for
 * accessibility and no-JS functionality. Page-level FAQPage schema
 * is emitted separately by the page for SEO.
 */
export default function FaqAccordion({ title, items }: Props) {
  return (
    <section className="faq-block" aria-labelledby="faq-block-title">
      <h2 id="faq-block-title">{title}</h2>
      <div className="faq-block__list">
        {items.map((item, i) => (
          <details key={i} className="faq-block__item">
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
