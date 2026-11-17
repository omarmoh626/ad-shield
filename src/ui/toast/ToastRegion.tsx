export default function ToastRegion({ message }: { message: string }) {
  return <div className="toast" role="status" aria-live="polite">{message}</div>
}
