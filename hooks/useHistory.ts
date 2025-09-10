import { useState, useCallback } from 'react';

// A simple deep equality check for our state object.
// This prevents adding history states that are identical.
const deepEqual = (obj1: any, obj2: any) => {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
}

export const useHistory = <T>(initialState: T) => {
  const [state, setState] = useState({
    past: [] as T[],
    present: initialState,
    future: [] as T[],
  });

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  const undo = useCallback(() => {
    if (!canUndo) return;
    const { past, present, future } = state;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    setState({
      past: newPast,
      present: previous,
      future: [present, ...future],
    });
  }, [canUndo, state]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    const { past, present, future } = state;
    const next = future[0];
    const newFuture = future.slice(1);
    setState({
      past: [...past, present],
      present: next,
      future: newFuture,
    });
  }, [canRedo, state]);

  const set = useCallback((newState: T) => {
    const { present } = state;
    if (deepEqual(newState, present)) return;

    setState({
      past: [...state.past, present],
      present: newState,
      future: [],
    });
  }, [state]);

  const reset = useCallback((newInitialState: T) => {
    setState({
      past: [],
      present: newInitialState,
      future: [],
    });
  }, []);

  return {
    state: state.present,
    setState: set,
    undo,
    redo,
    resetState: reset,
    canUndo,
    canRedo,
  };
};
