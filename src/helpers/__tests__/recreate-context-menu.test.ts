const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

test("context menu rebuilds run sequentially", async () => {
  const removeCallbacks: (() => void)[] = [];
  const create = jest.fn().mockReturnValue("block_site");
  const addListener = jest.fn();
  Object.assign(global, {
    chrome: {
      contextMenus: {
        create,
        onClicked: { addListener },
        removeAll: (callback: () => void) => removeCallbacks.push(callback),
      },
    },
  });

  const { default: recreateContextMenu } = await import("../recreate-context-menu");
  const onBlock = jest.fn();
  recreateContextMenu(true, onBlock);
  recreateContextMenu(true, onBlock);
  await flushPromises();

  expect(removeCallbacks).toHaveLength(1);
  removeCallbacks.shift()?.();
  await flushPromises();
  expect(create).toHaveBeenCalledTimes(3);
  expect(removeCallbacks).toHaveLength(1);

  removeCallbacks.shift()?.();
  await flushPromises();
  expect(create).toHaveBeenCalledTimes(6);
  expect(addListener).toHaveBeenCalledTimes(1);
});
