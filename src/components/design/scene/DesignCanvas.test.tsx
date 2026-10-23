import { Component, StrictMode, type ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderProps, RootState } from '@react-three/fiber';
import { DesignCanvas } from './DesignCanvas';

const renderer = vi.hoisted(() => ({
  configure: vi.fn<(props: RenderProps<HTMLCanvasElement>) => Promise<void>>().mockResolvedValue(undefined),
  render: vi.fn(),
  unmount: vi.fn(),
}));
const createRoot = vi.hoisted(() => vi.fn(() => renderer));
vi.mock('@react-three/fiber', () => ({ createRoot, events: vi.fn(), extend: vi.fn() }));

let notifyResize: () => void;
let width: number;
const disconnect = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  renderer.configure.mockResolvedValue(undefined);
  width = 800;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width, height: 600, top: 100, left: 20, right: width + 20, bottom: 700, x: 20, y: 100, toJSON: () => ({}) }));
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { notifyResize = callback; }
    observe() {}
    disconnect = disconnect;
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('DesignCanvas lifecycle', () => {
  it('keeps one root through StrictMode replay, updates size and props, and releases it on removal', async () => {
    const onPointerMissed = vi.fn();
    const { rerender, unmount } = render(<StrictMode><DesignCanvas frameloop="demand" onPointerMissed={onPointerMissed}>{null}</DesignCanvas></StrictMode>);
    await act(async () => notifyResize());
    await waitFor(() => expect(renderer.render).toHaveBeenCalled());
    expect(createRoot).toHaveBeenCalledTimes(1);
    const configuration = renderer.configure.mock.calls.at(-1)![0];
    expect(configuration).toMatchObject({ size: { width: 800, height: 600 }, frameloop: 'demand', onPointerMissed });
    const connect = vi.fn();
    configuration.onCreated!({ events: { connect } } as unknown as RootState);
    expect(connect).toHaveBeenCalledWith(document.querySelector('canvas'));

    width = 480;
    await act(async () => notifyResize());
    await waitFor(() => expect(renderer.configure.mock.calls.at(-1)![0].size!.width).toBe(480));
    rerender(<StrictMode><DesignCanvas frameloop="demand" orthographic>{null}</DesignCanvas></StrictMode>);
    await waitFor(() => expect(renderer.configure.mock.calls.at(-1)![0].orthographic).toBe(true));
    expect(createRoot).toHaveBeenCalledTimes(1);
    expect(renderer.unmount).not.toHaveBeenCalled();
    unmount();
    expect(renderer.unmount).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalled();
  });

  it('waits for a measurable container and ignores configuration that finishes after removal', async () => {
    width = 0;
    const { unmount } = render(<DesignCanvas>{null}</DesignCanvas>);
    await act(async () => notifyResize());
    expect(createRoot).not.toHaveBeenCalled();
    let finish: () => void = () => {};
    renderer.configure.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    width = 800;
    await act(async () => notifyResize());
    expect(createRoot).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => finish());
    expect(renderer.render).not.toHaveBeenCalled();
    expect(renderer.unmount).toHaveBeenCalledTimes(1);
  });

  it('forwards renderer startup errors to the enclosing DOM fallback', async () => {
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() { return { failed: true }; }
      render() { return this.state.failed ? <p role="alert">3D view unavailable</p> : this.props.children; }
    }
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderer.configure.mockRejectedValueOnce(new Error('WebGL unavailable'));
    render(<Boundary><DesignCanvas>{null}</DesignCanvas></Boundary>);
    await act(async () => notifyResize());
    expect(await screen.findByRole('alert')).toHaveTextContent('3D view unavailable');
    expect(renderer.unmount).toHaveBeenCalledTimes(1);
  });
});
