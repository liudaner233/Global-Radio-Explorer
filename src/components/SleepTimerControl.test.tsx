import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SleepTimerControl from './SleepTimerControl';

describe('sleep timer control', () => {
  let initialWidth: number;

  beforeEach(() => {
    initialWidth = window.innerWidth;
  });

  afterEach(() => {
    Reflect.set(window, 'innerWidth', initialWidth);
    vi.restoreAllMocks();
  });

  it('sets a timer without leaving the menu open', async () => {
    const user = userEvent.setup();
    const onSetTimer = vi.fn();
    render(<SleepTimerControl deadline={null} remainingMs={null} onSetTimer={onSetTimer} />);
    await user.click(screen.getByRole('button', { name: 'Sleep timer' }));
    expect(screen.getByRole('dialog', { name: 'Sleep timer settings' })).toBeVisible();
    expect(screen.getByText(/final 30 seconds/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Set sleep timer for 30 minutes' }));
    expect(onSetTimer).toHaveBeenCalledWith(30);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sleep timer' })).toHaveFocus();
  });

  it('shows the remaining time and allows cancellation', async () => {
    const user = userEvent.setup();
    const onSetTimer = vi.fn();
    render(
      <SleepTimerControl
        deadline={Date.now() + 65_100}
        remainingMs={65_100}
        onSetTimer={onSetTimer}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Sleep timer: 1:06 remaining' }));
    await user.click(screen.getByRole('button', { name: 'Cancel timer' }));
    expect(onSetTimer).toHaveBeenCalledWith(null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape and outside interaction without changing the timer', async () => {
    const user = userEvent.setup();
    const onSetTimer = vi.fn();
    render(
      <>
        <SleepTimerControl deadline={null} remainingMs={null} onSetTimer={onSetTimer} />
        <button>Outside control</button>
      </>
    );
    const trigger = screen.getByRole('button', { name: 'Sleep timer' });
    const focus = vi.spyOn(trigger, 'focus');
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    await user.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside control' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onSetTimer).not.toHaveBeenCalled();
  });

  it('portals above the player and keeps the menu inside the viewport on resize', async () => {
    const user = userEvent.setup();
    const onSetTimer = vi.fn();
    render(<SleepTimerControl deadline={null} remainingMs={null} onSetTimer={onSetTimer} />);
    const trigger = screen.getByRole('button', { name: 'Sleep timer' });
    let triggerRight = 200;
    vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(
      () => ({ right: triggerRight }) as DOMRect
    );
    Reflect.set(window, 'innerWidth', 390);
    await user.click(trigger);
    const menu = screen.getByRole('dialog', { name: 'Sleep timer settings' });
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveClass('fixed', 'bottom-[calc(var(--player-height,112px)+12px)]');
    expect(menu.style.left).toBe('16px');
    fireEvent.pointerDown(menu);
    expect(menu).toBeInTheDocument();
    triggerRight = 1_300;
    Reflect.set(window, 'innerWidth', 1_440);
    fireEvent(window, new Event('resize'));
    expect(menu.style.left).toBe('1028px');
    triggerRight = 800;
    Reflect.set(window, 'innerWidth', 768);
    fireEvent(window, new Event('resize'));
    expect(menu.style.left).toBe('480px');
    triggerRight = 380;
    Reflect.set(window, 'innerWidth', 390);
    fireEvent(window, new Event('resize'));
    expect(menu.style.left).toBe('102px');
    await user.click(screen.getByRole('button', { name: 'Set sleep timer for 15 minutes' }));
    expect(onSetTimer).toHaveBeenCalledWith(15);
  });
});
