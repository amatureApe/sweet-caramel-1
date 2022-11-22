import React from "react";

interface IconProps {
  color: string;
  size: string;
}
const DiscordIcon: React.FC<IconProps> = ({ color, size }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#clip0_993_13187)">
        <path
          d="M3.57976 21.196H17.8388L17.1578 18.991L18.7868 20.389L20.2798 21.727L22.9998 24V2.475C22.9318 1.137 21.7798 0 20.3518 0L3.58476 0.003C2.15776 0.003 0.999756 1.142 0.999756 2.48V18.72C0.999756 20.131 2.15576 21.196 3.57976 21.196ZM14.1278 5.683L14.0948 5.695L14.1068 5.683H14.1278ZM6.49676 6.952C8.32976 5.618 10.0288 5.682 10.0288 5.682L10.1658 5.817C7.92276 6.352 6.90576 7.354 6.90576 7.354C6.90576 7.354 7.17776 7.221 7.65276 7.018C10.6738 5.83 13.9728 5.916 17.0268 7.42C17.0268 7.42 16.0078 6.483 13.9028 5.883L14.0888 5.7C14.3798 5.701 15.9198 5.755 17.5678 6.96C17.5678 6.96 19.4118 10.11 19.4118 13.98C19.3508 13.906 18.2678 15.646 15.4808 15.706C15.4808 15.706 15.0088 15.172 14.6728 14.706C16.3028 14.238 16.9128 13.302 16.9128 13.302C16.3778 13.639 15.8898 13.839 15.4938 14.039C14.8848 14.307 14.2748 14.439 13.6658 14.574C10.7818 15.042 9.16276 14.259 7.63276 13.638L7.10976 13.372C7.10976 13.372 7.71876 14.308 9.28376 14.776C8.87276 15.245 8.46576 15.778 8.46576 15.778C5.67976 15.712 4.66376 13.972 4.66376 13.972C4.66376 10.096 6.49676 6.952 6.49676 6.952Z"
          className={color}
        />
        <path
          d="M14.3078 12.7711C15.0188 12.7711 15.5978 12.1711 15.5978 11.4311C15.5978 10.6961 15.0218 10.0961 14.3078 10.0961V10.0991C13.5998 10.0991 13.0198 10.6971 13.0178 11.4371C13.0178 12.1711 13.5968 12.7711 14.3078 12.7711Z"
          className={color}
        />
        <path
          d="M9.69015 12.7711C10.4011 12.7711 10.9801 12.1711 10.9801 11.4311C10.9801 10.6961 10.4051 10.0961 9.69415 10.0961L9.69015 10.0991C8.97915 10.0991 8.40015 10.6971 8.40015 11.4371C8.40015 12.1711 8.97915 12.7711 9.69015 12.7711Z"
          className={color}
        />
      </g>
      <defs>
        <clipPath id="clip0_993_13187">
          <rect width="24" height="24" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
};

export default DiscordIcon;