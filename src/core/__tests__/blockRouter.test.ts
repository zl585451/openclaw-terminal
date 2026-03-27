import { blockRouter } from '../blockRouter';

test('plain text', () => {
  const blocks = blockRouter('hello');
  expect(blocks.length).toBe(1);
});

test('code block parse', () => {
  const input = 'hi\n```js\nconsole.log(1)\n```';
  const blocks = blockRouter(input);

  expect(blocks.some((b) => b.type === 'code')).toBe(true);
});

test('mixed content', () => {
  const input = 'a\n```ts\nx\n```\nb';
  const blocks = blockRouter(input);

  expect(blocks.length).toBe(3);
});
