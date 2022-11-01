import { InfoIconWithTooltip } from "components/InfoIconWithTooltip";
import CardIcon from "../CardIcon";
import { InfoIconWithModalProps } from "../InfoIconWithModal";

interface StatInfoCardProps {
  title: string;
  content: string | JSX.Element;
  icon: string;
  info?: InfoIconWithModalProps;
}
export default function StatInfoCard({ title, content, icon, info }: StatInfoCardProps): JSX.Element {
  return (
    <div className="bg-white border border-customLightGray rounded-lg h-full flex flex-col">
      <div className="w-full flex flex-row p-6 h-full items-center justify-center">
        <CardIcon icon={icon} />
        <div className="ml-4 w-full">
          <div className="flex flex-row items-center w-full pt-1">
            <p className="font-normal leading-5 text-primaryLight text-base">{title}</p>
            {info && (
              <InfoIconWithTooltip
                classExtras="w-5 h-5 mt-0 ml-2"
                id={info.title}
                title={info.title}
                content={info.content}
              />
            )}
          </div>
          <h3 className="text-3xl text-primary mt-2">{content}</h3>
        </div>
      </div>
    </div>
  );
}
