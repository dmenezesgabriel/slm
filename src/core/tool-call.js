export function makeToolCall(name, args = {}, index = 0) {
  return {
    id: `call_${index}`,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}
