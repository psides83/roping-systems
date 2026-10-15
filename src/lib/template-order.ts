/** Change one division's order while retaining every other division's slots. */
export function replaceTemplateGroupOrder(order: string[], groupOrder: string[]): string[] {
  const members = new Set(groupOrder);
  let index = 0;
  return order.map(id => members.has(id) ? groupOrder[index++] : id);
}

export function moveTemplate(order: string[], id: string, destination: string): string[] {
  if (id === destination || !order.includes(id) || !order.includes(destination)) return order;
  const next = order.filter(item => item !== id);
  next.splice(order.indexOf(destination), 0, id);
  return next;
}
