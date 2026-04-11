import Link from 'next/link'
export default function NotFound() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>Página não encontrada</h2>
      <Link href="/">Voltar ao início</Link>
    </div>
  )
}
