export default function ScreenShell({ title, description }) {
  return (
    <section className="screen-placeholder" aria-labelledby="screen-title">
      <h1 id="screen-title">{title}</h1>
      <p>{description}</p>
    </section>
  )
}
