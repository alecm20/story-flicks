import React, { useState, useEffect } from 'react';
import type { FormProps } from 'antd';
import { Button, Form, Input, InputNumber, Select, message, Switch, Tooltip, Radio } from 'antd';
import { useTranslation } from 'react-i18next'
import { getVoiceList, getLLMProviders, generateVideo, generateStoryboard, getVoiceOptions } from '../../services/index';
import { VOICE_LANGUAGES, VOICE_LANGUAGES_LABELS, VOICE_PROVIDERS, LEARNER_AGE_OPTIONS } from '../../constants';
import styles from './index.module.css'
import { useVideoStore } from "../../stores/index";
import StoryboardEditor from '../StoryboardEditor';
import VideoResult from '../VideoResult';

type FieldType = {
    text_llm_provider?: string; // Text LLM provider
    image_llm_provider?: string; // Image LLM provider
    text_llm_model?: string; // Text LLM model
    image_llm_model?: string; // Image LLM model
    use_inpainting?: boolean; // Use img2img/inpainting
    avoid_exact_counts?: boolean; // Avoid exact numeric counts
    resolution?: string; // 分辨率
    test_mode?: boolean; // 是否为测试模式
    task_id?: string; // 任务ID，测试模式才需要
    segments: number; // 分段数量 (1-10)
    language?: Language; // 故事语言
    story_prompt?: string; // 故事提示词，测试模式不需要，非测试模式必填
    use_provided_content?: boolean; // Use story_prompt as the finished story (skip story LLM)
    topic_type?: "dialogue" | "explanation" | "scene" | "sequence";
    image_style?: string; // 图片风格，测试模式不需要，非测试模式必填
    subject?: string; // Optional cover subject
    learner_age?: "3-5" | "6-8" | "9-12" | "13-15" | "16-18";
    voice_provider?: string; // gtts | edge-tts | google-tts
    voice_name: string; // 语音名称，需要和语言匹配
    voice_rate: number; // 语音速率，默认写1
    karaoke?: boolean; // Karaoke word-level highlight
    chinese_subtitle_enabled?: boolean; // Chinese subtitle translation under English subtitle
    karaoke_highlight_color?: string; // Hex color for karaoke background
};

const VOICE_RATE_OPTIONS = [
    { value: 1.0, label: '1.00x (Normal)' },
    { value: 0.95, label: '0.95x (Slightly slower)' },
    { value: 0.9, label: '0.90x (Recommended for children)' },
    { value: 0.85, label: '0.85x (Slow)' },
];


const App: React.FC = () => {
    const { setVideoUrl, setAssembling } = useVideoStore();
    const { t } = useTranslation();
    const [form] = Form.useForm();
    const [voiceOptions, setVoiceOptions] = useState<{ providers: string[]; languages: Record<string, string[]> }>({ providers: [], languages: {} });
    const [voiceLanguages, setVoiceLanguages] = useState<string[]>(VOICE_LANGUAGES);
    const [nowVoiceList, setNowVoiceList] = useState<string[]>([]);

    const [mode, setMode] = useState<'simple' | 'storyboard'>('storyboard');
    const [storyboardData, setStoryboardData] = useState<{ task_id: string, scenes: any[] } | null>(null);
    const [generating, setGenerating] = useState(false);

    const [llmProviders, setLLMProviders] = useState<{
        textLLMProviders: string[],
        imageLLMProviders: string[],
        defaults?: {
            text_llm_model?: string;
            image_llm_model?: string;
            resolution?: string;
        }
    }>({ textLLMProviders: [], imageLLMProviders: [] });

    useEffect(() => {
        console.log('useEffect');
        getLLMProviders().then(res => {
            console.log('llmProviders', res);
            setLLMProviders(res);
            // Set default model & resolution values from backend
            form.setFieldsValue({
                text_llm_model: res.text_llm_model,
                image_llm_model: res.image_llm_model,
                resolution: res.resolution || '1080*1920', // fallback
                avoid_exact_counts: true,
                karaoke: true,
                chinese_subtitle_enabled: true,
                text_llm_provider: res.text_llm_provider || res.textLLMProviders?.[0],
                image_llm_provider: res.image_llm_provider || res.imageLLMProviders?.[0],
                learner_age: '3-5',
                karaoke_highlight_color: '#FFFF00',
            });
        }).catch(err => {
            console.log(err);
        })
        getVoiceOptions().then(res => {
            setVoiceOptions(res);
            const provider = res.providers?.includes('google-tts') ? 'google-tts' : (res.providers?.[0] || 'gtts');
            form.setFieldsValue({ voice_provider: provider });
            const langs = res.languages?.[provider] || VOICE_LANGUAGES;
            setVoiceLanguages(langs);
            const initLang = provider === 'gtts' ? 'fixed-en-GB' : (langs[0] || 'en-GB');
            form.setFieldsValue({ language: initLang });
            if (provider === 'gtts') {
                form.setFieldsValue({ voice_name: 'default' });
            } else {
                getVoiceList({ provider, language: initLang }).then(vres => {
                    setNowVoiceList(vres?.voices || []);
                    if (vres?.voices?.length > 0) {
                        form.setFieldsValue({ voice_name: vres.voices[0].replace('-Female', '').replace('-Male', '') });
                    }
                });
            }
        }).catch(err => {
            console.log(err);
        });
    }, []);
    const onFinish: FormProps<FieldType>['onFinish'] = async (values) => {
        console.log('Success:', values);
        const payload = {
            ...values,
            segments: values.topic_type === 'sequence' ? 1 : values.segments,
            karaoke_highlight_color: typeof values.karaoke_highlight_color === 'string' ? values.karaoke_highlight_color : (values.karaoke_highlight_color as any)?.toHexString?.() || '#FFFF00',
        };
        setGenerating(true);
        if (mode === 'simple') {
            setAssembling(true);
            message.loading({ content: 'Generating Video, please wait...', key: 'gen' });
            try {
                const res = await generateVideo(payload);
                if (res?.success === false) throw new Error(res?.message || 'Generate Video Failed');
                message.success({ content: 'Generate Video Success', key: 'gen' });
                if (res?.data?.video_url) setVideoUrl(res.data.video_url + '?t=' + Date.now());
            } catch (err: any) {
                message.error({ content: 'Generate Video Failed: ' + (err?.message || JSON.stringify(err)), key: 'gen' }, 10);
                console.log('generateVideo err', err);
            } finally {
                setGenerating(false);
                setAssembling(false);
            }
        } else {
            message.loading({ content: 'Step 1: Generating Storyboard assets...', key: 'gen' });
            try {
                const res = await generateStoryboard(payload);
                if (res?.success === false) throw new Error(res?.message || 'Generate Storyboard Failed');
                message.success({ content: 'Storyboard generated! Please edit below.', key: 'gen' });
                if (res?.data) {
                    setStoryboardData({
                        task_id: res.data.task_id,
                        scenes: res.data.scenes
                    });
                }
            } catch (err: any) {
                message.error({ content: 'Generate Storyboard Failed: ' + (err?.message || JSON.stringify(err)), key: 'gen' }, 10);
                console.log('generateStoryboard err', err);
            } finally {
                setGenerating(false);
            }
        }
    };

    const onFinishFailed: FormProps<FieldType>['onFinishFailed'] = (errorInfo) => {
        console.log('Failed:', errorInfo);
    };
    const languageLabelMap = new Map(VOICE_LANGUAGES_LABELS.map((l) => [l.value, l.label]));

    const handleVoiceProviderChange = (provider: string) => {
        const fallbackLangs = provider === 'gtts'
            ? ['fixed-en-GB']
            : VOICE_LANGUAGES.filter((l) => !l.startsWith('fixed-'));
        const langs = voiceOptions.languages?.[provider] || fallbackLangs;
        setVoiceLanguages(langs);
        const nextLang = provider === 'gtts' ? 'fixed-en-GB' : (langs[0] || 'en-GB');
        form.setFieldsValue({ language: nextLang });
        if (provider === 'gtts') {
            setNowVoiceList([]);
            form.setFieldsValue({ voice_name: 'default' });
            return;
        }
        getVoiceList({ provider, language: nextLang }).then(res => {
            setNowVoiceList(res?.voices || []);
            if (res?.voices?.length > 0) {
                form.setFieldsValue({ voice_name: res.voices[0].replace('-Female', '').replace('-Male', '') });
            }
        });
    };
    // defaults are set from backend in the initial load effect
    return (
        <div className={styles.formDiv}>
            <div style={{ marginBottom: 24, textAlign: 'center' }}>
                <Radio.Group value={mode} onChange={e => setMode(e.target.value)} buttonStyle="solid">
                    <Radio.Button value="simple">Simple Mode</Radio.Button>
                    <Radio.Button value="storyboard">Storyboard Mode</Radio.Button>
                </Radio.Group>
            </div>
            {!storyboardData ? (
                <Form
                    form={form}
                    name="basic"
                    labelCol={{ span: 8 }}
                    wrapperCol={{ span: 16 }}
                    style={{ minWidth: 600, justifyContent: 'flex-start' }}
                    initialValues={{ remember: true, karaoke: true, chinese_subtitle_enabled: true, voice_rate: 0.9 }}
                    onFinish={onFinish}
                    onFinishFailed={onFinishFailed}
                    autoComplete="off"
                >
                    <Form.Item<FieldType>
                        label={t('storyForm.txtLLMProvider')}
                        name="text_llm_provider"
                        rules={[{ required: true, message: t('storyForm.txtLLMProviderMissMsg') }]}
                    >
                        <Select>
                            {
                                llmProviders.textLLMProviders.map((provider) => {
                                    return <Select.Option value={provider}>{provider}</Select.Option>
                                })
                            }
                        </Select>
                    </Form.Item>
                    <Form.Item<FieldType>
                        label={t('storyForm.imgLLMProvider')}
                        name="image_llm_provider"
                        rules={[{ required: true, message: t('storyForm.imgLLMProviderMissMsg') }]}
                    >
                        <Select>
                            {
                                llmProviders.imageLLMProviders.map((provider) => {
                                    return <Select.Option value={provider}>{provider}</Select.Option>
                                })
                            }
                        </Select>
                    </Form.Item>
                    <Form.Item<FieldType>
                        label={t('storyForm.txtLLMModel')}
                        name="text_llm_model"
                        rules={[{ required: true, message: t('storyForm.txtLLMModelMissMsg') }]}
                    >
                        <Input placeholder={t('storyForm.textLLMPlaceholder')} />
                    </Form.Item>
                    <Form.Item<FieldType>
                        label={t('storyForm.imgLLMModel')}
                        name="image_llm_model"
                        rules={[{ required: true, message: t('storyForm.imgLLMModelMissMsg') }]}
                    >
                        <Input placeholder={t('storyForm.imageLLMPlaceholder')} />
                    </Form.Item>
                    <Form.Item<FieldType>
                        label={t('storyForm.resolution')}
                        name="resolution"
                        rules={[{ required: true, message: t('storyForm.resolutionMissMsg') }]}
                    >
                        <Input placeholder={t('storyForm.resolutionPlaceholder')} />
                    </Form.Item>
                    <Form.Item<FieldType>
                        label={
                            <Tooltip title="Use img2img/inpainting to keep visual continuity. Turn off for text-to-image models.">
                                <span>Use Inpainting</span>
                            </Tooltip>
                        }
                        name="use_inpainting"
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>
                    <Form.Item<FieldType>
                        label={
                            <Tooltip title="Avoid exact numbers like 'two cats' when the image model struggles with counting.">
                                <span>Avoid Exact Counts</span>
                            </Tooltip>
                        }
                        name="avoid_exact_counts"
                        valuePropName="checked"
                        initialValue={true}
                    >
                        <Switch defaultChecked />
                    </Form.Item>
                    <Form.Item<FieldType>
                        label="Voice Provider"
                        name="voice_provider"
                        rules={[{ required: true, message: "Please select a voice provider" }]}
                    >
                        <Select onChange={handleVoiceProviderChange}>
                            {VOICE_PROVIDERS.map((p) => (
                                <Select.Option value={p.value}>{p.label}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item<FieldType>
                        label={t('storyForm.videoLanguage')}
                        name="language"
                        rules={[{ required: true, message: t('storyForm.videoLanguageMissMsg') }]}
                    >
                        <Select
                            onChange={(value) => {
                                const provider = form.getFieldValue('voice_provider') || 'gtts';
                                if (provider === 'gtts' || value?.startsWith('fixed')) {
                                    setNowVoiceList([]);
                                    form.setFieldsValue({ voice_name: 'default' });
                                    return;
                                }
                                getVoiceList({ provider, language: value }).then(res => {
                                    setNowVoiceList(res?.voices || []);
                                    if (res?.voices?.length > 0) {
                                        form.setFieldsValue({ voice_name: res.voices[0].replace('-Female', '').replace('-Male', '') });
                                    }
                                });
                            }}
                        >
                            {
                                voiceLanguages.map((lang) => {
                                    return <Select.Option value={lang}>{languageLabelMap.get(lang) || lang}</Select.Option>
                                })
                            }
                        </Select>
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.language !== curr.language}>
                        {({ getFieldValue }) => {
                            const lang = getFieldValue('language');
                            if (lang?.startsWith('fixed')) {
                                return (
                                    <div style={{ color: '#888', marginBottom: 16 }}>
                                        Using fixed gTTS voice (no selection needed for British English)
                                        <Form.Item name="voice_name" noStyle>
                                            <Input type="hidden" /> {/* hidden input to force inclusion */}
                                        </Form.Item>
                                    </div>
                                );
                            }
                            return (
                                <Form.Item<FieldType>
                                    label={t('storyForm.voiceName')}
                                    name="voice_name"
                                    rules={[{ required: true, message: t('storyForm.voiceNameMissMsg') }]}
                                >
                                    <Select>
                                        {
                                            nowVoiceList.map((voice) => {
                                                return <Select.Option value={voice.replace('-Female', '').replace('-Male', '')}>{voice}</Select.Option>
                                            })
                                        }
                                    </Select>
                                </Form.Item>
                            );
                        }}
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.voice_provider !== curr.voice_provider}>
                        {({ getFieldValue }) => {
                            const provider = getFieldValue('voice_provider') || 'gtts';
                            if (provider === 'gtts') return null;
                            return (
                                <Form.Item<FieldType>
                                    label={
                                        <Tooltip title={t('storyForm.voiceRateHint')}>
                                            <span>{t('storyForm.voiceRate')}</span>
                                        </Tooltip>
                                    }
                                    name="voice_rate"
                                    rules={[{ required: true, message: t('storyForm.voiceRateMissMsg') }]}
                                >
                                    <Select options={VOICE_RATE_OPTIONS} />
                                </Form.Item>
                            );
                        }}
                    </Form.Item>
                    <Form.Item<FieldType>
                        label="Karaoke"
                        name="karaoke"
                        valuePropName="checked"
                        initialValue={true}
                    >
                        <Switch />
                    </Form.Item>

                    <Form.Item<FieldType>
                        label={t('storyForm.chineseSubtitle')}
                        name="chinese_subtitle_enabled"
                        valuePropName="checked"
                        initialValue={true}
                    >
                        <Switch />
                    </Form.Item>
                    <Form.Item<FieldType>
                        label="Subject (Optional)"
                        name="subject"
                    >
                        <Input placeholder="Plural" />
                    </Form.Item>
                    <Form.Item<FieldType>
                        label="Learner Age"
                        name="learner_age"
                        initialValue="3-5"
                    >
                        <Select>
                            {LEARNER_AGE_OPTIONS.map((item) => (
                                <Select.Option key={item.value} value={item.value}>
                                    {item.label}
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item<FieldType>
                        label="Use My Content Directly"
                        name="use_provided_content"
                        valuePropName="checked"
                        initialValue={false}
                        tooltip="When on, the text below is treated as your finished story. The AI will not rewrite it — it is only split into scenes, then images and voice are generated as usual."
                    >
                        <Switch />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.use_provided_content !== curr.use_provided_content}>
                        {({ getFieldValue }) => {
                            const usesOwnContent = !!getFieldValue('use_provided_content');
                            return (
                                <Form.Item<FieldType>
                                    label={usesOwnContent ? 'Your Full Story' : t('storyForm.textPrompt')}
                                    name="story_prompt"
                                    rules={[{ required: true, message: t('storyForm.textPromptMissMsg') }]}
                                >
                                    <Input.TextArea
                                        rows={usesOwnContent ? 10 : 4}
                                        placeholder={usesOwnContent
                                            ? 'Paste your finished story here. Optionally mark scene breaks with blank lines, "---", or numbered lines like "1.".'
                                            : t('storyForm.storyPromptPlaceholder')}
                                    />
                                </Form.Item>
                            );
                        }}
                    </Form.Item>
                    <Form.Item<FieldType>
                        label="Topic Type"
                        name="topic_type"
                        initialValue="explanation"
                        rules={[{ required: true, message: "Please select a topic type" }]}
                    >
                        <Select
                            onChange={(value) => {
                                if (value === 'sequence') {
                                    form.setFieldsValue({ segments: 1, use_inpainting: false });
                                }
                            }}
                        >
                            <Select.Option value="dialogue">Dialogue (kid + kid/teacher/parent)</Select.Option>
                            <Select.Option value="explanation">Explanation (word/grammar/science)</Select.Option>
                            <Select.Option value="scene">Scene Description</Select.Option>
                            <Select.Option value="sequence">Sequence (counting/months/weekdays)</Select.Option>
                        </Select>
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.topic_type !== curr.topic_type}>
                        {({ getFieldValue }) => {
                            const isSequence = getFieldValue('topic_type') === 'sequence';
                            return (
                                <Form.Item<FieldType>
                                    label={t('storyForm.segments')}
                                    name="segments"
                                    initialValue={3}
                                    rules={[{ required: true, type: 'number', min: 1, max: 10, message: t('storyForm.segmentsMissMsg') }]}
                                >
                                    <InputNumber min={1} max={10} placeholder="3" style={{ width: '100%' }} disabled={isSequence} />
                                </Form.Item>
                            );
                        }}
                    </Form.Item>
                    <Form.Item label={null}>
                        <Button type="primary" htmlType="submit" loading={generating}>
                            {mode === 'simple' ? t('storyForm.submit') : 'Step 1: Generate Storyboard'}
                        </Button>
                    </Form.Item>
                </Form>
            ) : (
                <StoryboardEditor
                    taskId={storyboardData.task_id}
                    scenes={storyboardData.scenes}
                    resolution={form.getFieldValue('resolution') || '1080*1920'}
                    chineseSubtitleEnabled={form.getFieldValue('chinese_subtitle_enabled')}
                    karaoke={form.getFieldValue('karaoke')}
                    subject={form.getFieldValue('subject')}
                    topicType={form.getFieldValue('topic_type')}
                    onClose={() => setStoryboardData(null)}
                />
            )}
            <VideoResult />
        </div>
    )
}

export default App;
