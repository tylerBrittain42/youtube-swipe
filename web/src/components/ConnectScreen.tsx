/**
 * Shown in place of the deck when the backend has no usable YouTube grant —
 * either never logged in ('connect') or the stored grant went dead ('reconnect').
 * Both link to the backend's OAuth entry point; the callback redirects back to
 * '/', which remounts the app and re-checks health.
 */
export default function ConnectScreen(props: {
  mode: 'connect' | 'reconnect'
}) {
  return (
    <div
      class="mx-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-dashed border-neutral-300 px-6 py-12 text-center"
      data-testid="connect-screen"
    >
      <p class="text-lg font-medium text-neutral-800">
        {props.mode === 'connect'
          ? 'Connect your YouTube account'
          : 'Reconnect YouTube'}
      </p>
      <p class="text-sm text-neutral-500">
        {props.mode === 'connect'
          ? 'Sign in with Google to load your playlist and start triaging.'
          : 'Your YouTube access expired or was revoked. Sign in again to pick up where you left off.'}
      </p>
      <a
        href="/api/auth/login"
        class="rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        {props.mode === 'connect' ? 'Connect YouTube' : 'Reconnect YouTube'}
      </a>
    </div>
  )
}
