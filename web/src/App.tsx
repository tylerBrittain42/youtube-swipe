import CardStack from './components/CardStack'

function App() {
  return (
    <div class="flex min-h-svh flex-col items-center gap-8 px-4 py-10">
      <header class="text-center">
        <h1 class="text-2xl font-semibold text-neutral-900">Triage</h1>
        <p class="mt-1 text-sm text-neutral-500">
          Swipe right to keep, left to move, up to watch now
        </p>
      </header>
      <CardStack />
    </div>
  )
}

export default App
