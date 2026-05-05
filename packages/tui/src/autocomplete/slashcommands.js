/**
 * Slash-command autocomplete registry.
 * Commands: [{ name: string, description: string }]
 */
export class SlashCommands {
  constructor(commands = []) {
    this.commands = commands;
  }

  register(name, description) {
    this.commands.push({ name, description });
    return this;
  }

  /**
   * Return matching completions for the current input value.
   * Only activates when value starts with "/".
   * @param {string} value
   * @returns {{ label: string, value: string }[]}
   */
  getCompletions(value) {
    if (!value.startsWith("/")) return [];
    const query = value.slice(1).toLowerCase();
    return this.commands
      .filter((c) => c.name.startsWith(query))
      .map((c) => ({ label: `/${c.name}  ${c.description}`, value: `/${c.name} ` }))
      .slice(0, 8);
  }
}
