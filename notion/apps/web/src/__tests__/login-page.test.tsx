import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

/* ------------------------------------------------------------------ */
/*  Mocks — vi.mock calls are hoisted above imports by vitest         */
/* ------------------------------------------------------------------ */

const mockPush = vi.fn()
const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({ get: () => null }),
}))

const mockConnect = vi.fn()
const mockDisconnect = vi.fn()

vi.mock('wagmi', () => ({
  useAccount: vi.fn(() => ({ address: undefined, isConnected: false })),
  useConnect: vi.fn(() => ({ connect: mockConnect, isPending: false })),
  useDisconnect: vi.fn(() => ({ disconnect: mockDisconnect })),
}))

vi.mock('wagmi/connectors', () => ({
  injected: vi.fn(() => ({})),
}))

vi.mock('lucide-react', () => ({
  Loader2: (props: Record<string, unknown>) => <span data-testid="loader" {...props} />,
}))

import LoginPage from '../app/(auth)/login/page'

/* ------------------------------------------------------------------ */
/*  T6: Demo skip button component                                    */
/* ------------------------------------------------------------------ */

afterEach(() => {
  cleanup()
  delete process.env['NEXT_PUBLIC_DEMO_WORKSPACE_URL']
})

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env['NEXT_PUBLIC_DEMO_WORKSPACE_URL']
})

describe('T6: Demo skip button', () => {
  it('NEXT_PUBLIC_DEMO_WORKSPACE_URL not set -> button not rendered', () => {
    render(<LoginPage />)
    expect(screen.queryByText(/Try Demo/i)).not.toBeInTheDocument()
  })

  it('NEXT_PUBLIC_DEMO_WORKSPACE_URL set -> button renders with correct text', () => {
    process.env['NEXT_PUBLIC_DEMO_WORKSPACE_URL'] = '/workspace/demo-123'
    render(<LoginPage />)
    expect(screen.getByText('Try Demo \u2192')).toBeInTheDocument()
  })

  it('button has type="button" attribute', () => {
    process.env['NEXT_PUBLIC_DEMO_WORKSPACE_URL'] = '/workspace/demo-123'
    render(<LoginPage />)
    const btn = screen.getByRole('button', { name: /try demo/i })
    expect(btn).toHaveAttribute('type', 'button')
  })

  it('button has accessible aria-label', () => {
    process.env['NEXT_PUBLIC_DEMO_WORKSPACE_URL'] = '/workspace/demo-123'
    render(<LoginPage />)
    const btn = screen.getByRole('button', { name: /try demo workspace/i })
    expect(btn).toBeInTheDocument()
  })

  it('isLoading=true -> demo button not rendered (guard)', async () => {
    process.env['NEXT_PUBLIC_DEMO_WORKSPACE_URL'] = '/workspace/demo-123'

    // Simulate loading state by triggering wallet connection that triggers auto-login.
    // The component sets isLoading=true when handleLogin is called.
    // We mock useAccount to return connected state so the auto-login useEffect fires.
    const { useAccount } = await import('wagmi')
    vi.mocked(useAccount).mockReturnValue({
      address: '0x1234567890abcdef',
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>)

    // Make fetch hang so isLoading stays true
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch

    render(<LoginPage />)

    // The component should be in loading state (auto-login triggered)
    await waitFor(() => {
      expect(screen.getByText('Authenticating...')).toBeInTheDocument()
    })

    // Demo button should NOT be rendered while loading
    expect(screen.queryByText(/Try Demo/i)).not.toBeInTheDocument()

    // Restore
    vi.mocked(useAccount).mockReturnValue({
      address: undefined,
      isConnected: false,
    } as ReturnType<typeof useAccount>)
  })

  it('internal URL click -> uses router.push', async () => {
    process.env['NEXT_PUBLIC_DEMO_WORKSPACE_URL'] = '/workspace/demo-123'
    render(<LoginPage />)

    const btn = screen.getByRole('button', { name: /try demo/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/workspace/demo-123')
    })
  })

  it('external URL click -> sets window.location.href', async () => {
    process.env['NEXT_PUBLIC_DEMO_WORKSPACE_URL'] = 'https://demo.example.com/workspace'

    // Save and replace window.location with a writable mock
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, href: '' },
      writable: true,
      configurable: true,
    })

    render(<LoginPage />)

    const btn = screen.getByRole('button', { name: /try demo/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(window.location.href).toBe('https://demo.example.com/workspace')
    })

    // router.push should NOT be called for external URLs
    expect(mockPush).not.toHaveBeenCalled()

    // Restore
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })

  it('double-click -> no double navigation (disabled state)', async () => {
    process.env['NEXT_PUBLIC_DEMO_WORKSPACE_URL'] = '/workspace/demo-123'
    render(<LoginPage />)

    const btn = screen.getByRole('button', { name: /try demo/i })

    // First click
    fireEvent.click(btn)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledTimes(1)
    })

    // After first click, button should be disabled (isDemoNavigating = true)
    // and show loading state
    await waitFor(() => {
      expect(btn).toBeDisabled()
    })

    // Second click on disabled button should not trigger navigation
    fireEvent.click(btn)
    expect(mockPush).toHaveBeenCalledTimes(1) // Still 1, no second call
  })
})
