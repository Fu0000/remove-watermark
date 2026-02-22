import type { ReactNode } from "react";
import { Typography } from "antd";

interface PageHeaderProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="admin-page-header fade-in-up">
      <div>
        <Typography.Text className="admin-page-header__label">Operations View</Typography.Text>
        <Typography.Title level={2} className="admin-page-header__title">
          {title}
        </Typography.Title>
        <Typography.Paragraph className="admin-page-header__description">{description}</Typography.Paragraph>
      </div>
      {action ? <div className="admin-page-header__action">{action}</div> : null}
    </div>
  );
}
