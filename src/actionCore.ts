export type ActionCore = {
  exportVariable: (name: string, value: string) => void;
  getInput: (name: string) => string;
  getState: (name: string) => string;
  info: (message: string) => void;
  saveState: (name: string, value: string) => void;
  setFailed: (message: string) => void;
  setOutput: (name: string, value: string) => void;
  setSecret: (secret: string) => void;
  warning: (message: string) => void;
};
