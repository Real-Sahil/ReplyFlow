import { useConfigurationContext } from "../root/ConfigurationContext";

// The logo already carries the name, so the name is not written beside it again. The light and dark
// versions each show in their own theme (the dark one has white lettering that is invisible on light).
export const BrandLogo = ({ className = "h-5" }: { className?: string }) => {
  const { lightModeLogo, darkModeLogo, title } = useConfigurationContext();
  return (
    <>
      <img
        src={lightModeLogo}
        alt={title}
        className={`${className} dark:hidden`}
      />
      <img
        src={darkModeLogo}
        alt={title}
        className={`${className} hidden dark:block`}
      />
    </>
  );
};
