export default defineAppConfig({
  ui: {
    colors: {
      primary: "cyan",
      neutral: "zinc",
    },
    input: {
      slots: { root: "w-full" },
      defaultVariants: { size: "lg" },
    },
    textarea: {
      slots: { root: "w-full" },
      defaultVariants: { size: "lg" },
    },
    select: {
      slots: { base: "w-full" },
      defaultVariants: { size: "lg" },
    },
    selectMenu: {
      slots: { base: "w-full" },
      defaultVariants: { size: "lg" },
    },
  },
});
