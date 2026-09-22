export function ErrorRetry({
  message, onRetry,
}: { message: string; onRetry: () => void }) {
  return (
    <div className="error" role="alert">
      <p>{message}</p>
      <button className="btn" onClick={onRetry}>Try again</button>
    </div>
  )
}
