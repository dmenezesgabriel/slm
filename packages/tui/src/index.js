// Core engine
export { Screen }    from "./screen.js";
export { Renderer }  from "./renderer.js";
export { Component } from "./component.js";

// Built-in components
export { Text }          from "./components/Text.js";
export { TruncatedText } from "./components/TruncatedText.js";
export { Input }         from "./components/Input.js";
export { Editor }        from "./components/Editor.js";
export { Markdown }      from "./components/Markdown.js";
export { Loader }        from "./components/Loader.js";
export { SelectList }    from "./components/SelectList.js";
export { SettingsList }  from "./components/SettingsList.js";
export { Spacer }        from "./components/Spacer.js";
export { Image }         from "./components/Image.js";
export { Box }           from "./components/Box.js";
export { Container }     from "./components/Container.js";

// Autocomplete
export {
  Autocomplete,
  getFileCompletions,
  triggerFileCompletion,
  SlashCommands,
} from "./autocomplete/index.js";

// Low-level utilities (re-exported for convenience)
export * as ansi  from "./ansi.js";
export { strip, visibleWidth, padEnd, truncate } from "./strip.js";
export { wrap }   from "./wrap.js";
