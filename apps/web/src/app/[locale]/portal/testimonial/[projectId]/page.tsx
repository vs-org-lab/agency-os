import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { TestimonialExperience } from '@/components/testimonials/testimonial-experience';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadClientTestimonial } from '@/modules/testimonials/server';
import {
  beginTestimonialVideoAction,
  finishTestimonialVideoAction,
  sendTestimonialAction,
} from './actions';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; projectId: string }> };

/** AUT-21: the decision maker's testimonial on a delivered project, reached from the email. */
export default async function PortalTestimonialPage({ params }: PageProps) {
  const { locale: requested, projectId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const data = await loadClientTestimonial(session.claims, projectId);
  const t = await getTranslations('testimonials');

  if (!data) return <EmptyState title={t('title')} description={t('unavailable')} />;

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
      <h1 className="text-title text-text">{t('title')}</h1>
      <TestimonialExperience
        projectId={projectId}
        projectName={data.projectName}
        initial={data.testimonial}
        send={sendTestimonialAction}
        videoActions={{
          begin: beginTestimonialVideoAction,
          finish: finishTestimonialVideoAction,
        }}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'testimonials.title');
}
