export default function ScreenShell({ number, title, description }) {
  return (
    <section className="screen-placeholder" aria-labelledby="screen-title">
      <span className="screen-number">Screen {number}</span>
      <h1 id="screen-title">{title}</h1>
      <p>{description}</p>
    </section>
  )
}
