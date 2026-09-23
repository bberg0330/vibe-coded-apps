import { Button } from './Button'

export function ErrorRetry({
  message, onRetry,
}: { message: string; onRetry: () => void }) {
  return (
    <div className="error" role="alert">
      <p>{message}</p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  )
}
