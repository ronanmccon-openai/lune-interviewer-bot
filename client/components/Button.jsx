export default function Button({
  icon,
  children,
  onClick,
  className,
  disabled = false,
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700 active:translate-y-[0.5px] ${
        disabled ? "opacity-60 cursor-not-allowed hover:bg-emerald-600 active:translate-y-0" : ""
      } ${className ?? ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {children}
    </button>
  );
}
