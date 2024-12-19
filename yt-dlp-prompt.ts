#!/usr/bin/env -S npx tsx

import { multiselect, select, type SelectOptions } from '@clack/prompts';
import { exec } from 'child_process';
import { program, createArgument } from '@commander-js/extra-typings';
import { existsSync } from 'fs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const logErrorExit = (msg: string, { error, code = 1 }: { error?: any; code?: number } = {}) => {
  console.error(msg, error);
  process.exit(code);
};

const shell_exec = async (
  cmd: string,
  {
    cwd = process.cwd(),
    logStdout = false,
    logStderr = false,
  }: { cwd?: string; logStdout?: boolean; logStderr?: boolean } = {}
): Promise<{ stdout: string; stderr: string | null }> =>
  new Promise((resolve, reject) => {
    exec(cmd, { cwd, maxBuffer: 104857600 }, (error, stdout, stderr) => {
      if (logStderr && Boolean(stderr?.length)) console.log(`stderr: ${stderr}`);
      if (logStdout) console.log(stdout);
      if (!error) return resolve({ stdout: stdout ?? '', stderr: stderr ?? null });
      const message = `Failed to execute command: '${cmd}'`;
      console.error(message, error);
      reject(new Error(message, { cause: { error, stderr, stdout, cwd } }));
    });
  });

const commandExists = async (cmd: string) => {
  const { stdout } = await shell_exec(`command -v '${cmd}'`);
  if (existsSync(stdout.trim())) return stdout.trim();
  throw new Error(`${cmd} not found.`);
};

const verifyYtDlp = () => {
  try {
    return commandExists('yt-dlp');
  } catch (error) {
    logErrorExit('yt-dlp not found. Please install yt-dlp: https://github.com/yt-dlp/yt-dlp', { error });
  }
};
const verifyMkvpropedit = () => {
  try {
    return commandExists('mkvpropedit');
  } catch (error) {
    logErrorExit('mkvpropedit not found. Please install MKVToolNix: https://mkvtoolnix.download/.', { error });
  }
};
const verifyAtomicParsley = async () => {
  try {
    return commandExists('atomicparsley');
  } catch (e) {
    console.warn('atomicparsley not found. Trying AtomicParsley.', e);
  }
  try {
    return commandExists('AtomicParsley');
  } catch (error) {
    logErrorExit('AtomicParsley not found. Please install AtomicParsley: https://github.com/wez/atomicparsley.', {
      error,
    });
  }
};

const audioOnly = ({ resolution, fps }: Format) => (resolution === null || resolution === 'audio only') && !fps;

type FormatWithRes = Omit<Format, 'resolution' | 'height' | 'tbr'> & {
  resolution: string;
  height: number;
  tbr: number;
};
const notAudioOnly = (format: Format): format is FormatWithRes => !audioOnly(format);

const getVideoInfo = async (sourceUrl: string) => {
  try {
    console.log(`Fetching video info from ${sourceUrl}`);
    const { stdout } = await shell_exec(`yt-dlp -j ${sourceUrl}`);
    return JSON.parse(stdout) as Info;
  } catch (error) {
    console.error('Failed to get video info with yt-dlp', error);
    process.exit(1);
  }
};

const filterVideoOnlyFormatsSorted = (formats: Format[]) =>
  formats
    .filter(notAudioOnly)
    .sort((a, b) => ((a.height ?? 0) > (b.height ?? 0) && (a.tbr ?? 0) > (b.tbr ?? 0) ? -1 : 1));

type ClackStrOption = SelectOptions<string>['options'][number];

const getVideoOptions = (formats: Format[]) =>
  formats.map(
    ({ format_id, format_note, vcodec, acodec, tbr, resolution }): ClackStrOption => ({
      value: format_id,
      label: [format_note, resolution, tbr, vcodec, acodec, format_id, 'Video'].filter(Boolean).join(' - '),
      hint: 'may or may not have audio included',
    })
  );
const getAudioOptions = (formats: Format[]) =>
  formats.map(
    ({ format_note, format_id, language, acodec, tbr }): ClackStrOption => ({
      value: format_id,
      label: [format_note, language, acodec, tbr, format_id, 'Audio'].filter(Boolean).join(' - '),
      hint: 'You can select multiple audio streams',
    })
  );

const getTitlePartOptions = ({
  title,
  alt_title,
  fulltitle,
}: Info): { options: ClackStrOption[]; initialValues: string[] } => ({
  options: Object.entries({
    title,
    alt_title,
    ...(fulltitle && fulltitle !== title ? { fulltitle } : {}),
  })
    .filter((kv): kv is [string, string] => typeof kv[0] === 'string' && typeof kv[1] === 'string')
    .map(([label, value]) => ({
      label: `${label}: ${value}`,
      value,
    })),
  initialValues: [fulltitle || title || alt_title || 'could not find title in video info'],
});

program
  .name('yt-dlp-prompt')
  .addArgument(createArgument('source-url', 'The source URL to download the video from.').argRequired())
  .action(async sourceUrl => {
    if (!sourceUrl.length) {
      console.error('No source URL provided.');
      process.exit(1);
    }
    await verifyYtDlp();
    const cwd = process.cwd();

    const videoInfo = await getVideoInfo(sourceUrl);

    const videoFormats = filterVideoOnlyFormatsSorted(videoInfo.formats);
    const audioFormats = videoInfo.formats.filter(audioOnly);
    const videoStream = await (select({
      message: 'Select video quality and ',
      initialValue: videoFormats[0].format_id,
      options: getVideoOptions(videoFormats),
    }) as Promise<string>);

    const audioStreams = await (multiselect({
      message:
        'Select audio streams to add to the video (Only necessary if the video has no audio, or you need more than one audio streams)',
      initialValues: [],
      required: false,
      options: getAudioOptions(audioFormats),
    }) as Promise<string[]>);

    const titleParts = await (multiselect({
      message: 'Select title parts from the video info to use for title and filename.',
      ...getTitlePartOptions(videoInfo),
      required: false,
    }) as Promise<string[]>);

    const tagTitle = titleParts.filter(Boolean).join(' - ');
    const sanitizedTagTitle = tagTitle
      .replaceAll(/\.{2,}/g, '_')
      // eslint-disable-next-line no-useless-escape
      .replaceAll(/[ \/\\\%\[\]\{\}\!\~\$\?\"\'\,\:\;\*\^\`\=\|]/g, '_')
      .replaceAll(/_{2,}/g, '_')
      .replaceAll(/_{2,}/g, '_');

    const outFilePath = `${cwd}/${sanitizedTagTitle}`;

    const options = [
      '--audio-multistreams',
      '--embed-subs',
      '--embed-thumbnail',
      '--embed-metadata',
      '--embed-info-json',
      `-f '${[videoStream, ...audioStreams].join('+')}'`,
      `-o '${outFilePath}.%(ext)s'`,
    ];
    const ytDlpCmd = `yt-dlp ${options.join(' ')} ${sourceUrl}`;
    console.log(ytDlpCmd);
    try {
      await shell_exec(ytDlpCmd, { logStdout: true, logStderr: true, cwd });
    } catch (error) {
      console.error('Failed to download the video.', error);
      process.exit(1);
    }
    const [, year, month, day] = videoInfo.upload_date?.match(/^(\d{4})(\d{2})(\d{2})/) ?? [];

    if (existsSync(`${outFilePath}.mp4`)) {
      const atomicParsleyCmd = await verifyAtomicParsley();
      const atomicParsleyArgs = [
        `'${outFilePath}.mp4'`,
        `--overWrite`,
        `--title '${tagTitle}'`,
        `--TVNetwork '${videoInfo.extractor}'`,
        `--year '${year}-${month}-${day}'`,
      ];
      const tagCmd = `${atomicParsleyCmd} ${atomicParsleyArgs.join(' ')}`;
      console.log(tagCmd);
      try {
        await shell_exec(tagCmd, { logStdout: true, logStderr: true, cwd });
      } catch (error) {
        console.error('Failed to tag the video.', error);
        process.exit(1);
      }
      return;
    }
    if (existsSync(`${outFilePath}.mkv`)) {
      await verifyMkvpropedit();
      const mkvPropArgs = [`'${outFilePath}.mkv'`, `--edit info`];
      const mkvPropEditTitle = [...mkvPropArgs, `--set title='${tagTitle}'`];
      const mkvpropeditTitleCmd = `mkvpropedit ${mkvPropEditTitle.join(' ')}`;
      console.log(mkvpropeditTitleCmd);
      try {
        await shell_exec(mkvpropeditTitleCmd, { logStdout: true, logStderr: true, cwd });
      } catch (error) {
        console.error('Failed to tag the video.', error);
        process.exit(1);
      }
      return;
    }
    console.error('Failed to download the video.');
  })
  .parse(process.argv);

/**
 * Guessed type with quicktype.io
 */
interface Info {
  id: string;
  webpage_url: string;
  title: string;
  alt_title?: null | string;
  description: string;
  duration: number;
  language?: string;
  timestamp: number;
  is_live?: boolean;
  formats: Format[];
  subtitles: {
    [key in string]?: {
      url: string;
      ext: string;
      protocol?: string;
    }[];
  };
  thumbnails: {
    url: string;
    id: string;
    format_id?: string;
    width?: number;
    height?: number;
    resolution?: string;
  }[];
  chapters?: null;
  original_url: string;
  webpage_url_basename: string;
  webpage_url_domain: null | string;
  extractor: string;
  extractor_key: string;
  playlist: null;
  playlist_index: null;
  thumbnail: string;
  display_id: string;
  fulltitle: string;
  duration_string: string;
  upload_date: string;
  release_year: null;
  requested_subtitles: null;
  _has_drm: null;
  epoch: number;
  requested_formats?: Format[];
  format: string;
  format_id: string;
  ext: string;
  protocol: string;
  format_note?: string;
  filesize_approx?: number | null;
  tbr: number | null;
  width?: number;
  height?: number;
  resolution: null | string;
  fps?: number;
  dynamic_range: string;
  vcodec?: string;
  vbr: number | null;
  stretched_ratio?: null;
  aspect_ratio: number | null;
  acodec?: null | string;
  abr: null;
  asr?: null;
  audio_channels?: null;
  _filename: string;
  filename: string;
  _type: string;
  _version: Record<string, string | null>;
  _format_sort_fields?: string[];
  url?: string;
  language_preference?: number;
  quality?: number | null;
  video_ext?: string;
  audio_ext?: string;
  http_headers: { [key in string]?: string };
  format_index?: null;
  manifest_url?: string;
  preference?: number | null;
  has_drm?: boolean;
  age_limit?: number | null;
  series?: string;
  channel?: string;
  episode?: string;
  _old_archive_ids?: string[];
  uploader?: string;
}
interface Format {
  format_id: string;
  format_note?: string;
  format_index?: null;
  url: string;
  manifest_url?: string;
  language?: string;
  ext: string;
  protocol: string;
  preference?: number | null;
  quality?: number | null;
  has_drm?: boolean;
  vcodec?: string;
  language_preference?: number;
  audio_ext: string;
  video_ext: string;
  vbr: number | null;
  abr: number | null;
  tbr: number | null;
  resolution: null | string;
  aspect_ratio: number | null;
  http_headers: { [key in string]?: string };
  format: string;
  fps?: number | null;
  width?: number;
  height?: number;
  acodec?: string;
  dynamic_range?: null | string;
  filesize_approx?: number | null;
}
