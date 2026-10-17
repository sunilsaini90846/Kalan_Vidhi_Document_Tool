import { Component, type ReactNode } from 'react'

interface State { failed: boolean }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }
  static getDerivedStateFromError(): State { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-slate-600">The page hit an unexpected error. Your files were not uploaded anywhere.</p>
        <button className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-white" onClick={() => location.reload()}>Reload</button>
      </div>
    )
  }
}
