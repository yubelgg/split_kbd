"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Script from "next/script";
import { useTheme } from "next-themes";
import { Sun, Moon, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

// MediaPipe type definitions
interface Landmark {
    x: number;
    y: number;
    z: number;
    visibility?: number;
}

interface HandsResults {
    image: HTMLVideoElement;
    multiHandLandmarks?: Landmark[][];
    multiHandedness?: { label: string; score: number }[];
}

interface PoseResults {
    image: HTMLVideoElement;
    poseLandmarks?: Landmark[];
}

interface MediaPipeHands {
    setOptions(options: object): void;
    onResults(callback: (results: HandsResults) => void): void;
    send(input: { image: HTMLVideoElement }): Promise<void>;
    close(): void;
}

interface MediaPipePose {
    setOptions(options: object): void;
    onResults(callback: (results: PoseResults) => void): void;
    send(input: { image: HTMLVideoElement }): Promise<void>;
    close(): void;
}

type DrawingFunction = (
    ctx: CanvasRenderingContext2D,
    landmarks: Landmark[],
    connections: [number, number][],
    style?: { color?: string; lineWidth?: number }
) => void;

type LandmarkDrawFunction = (
    ctx: CanvasRenderingContext2D,
    landmarks: Landmark[],
    style?: { color?: string; lineWidth?: number; radius?: number }
) => void;

const KEYBOARD_PRESETS = [
    { id: 'standard', name: 'Standard Keyboard', actuation: 50, description: '~50g actuation' },
    { id: 'cherry-brown', name: 'Cherry MX Brown', actuation: 45, description: '45g tactile' },
    { id: 'cherry-red', name: 'Cherry MX Red', actuation: 45, description: '45g linear' },
    { id: 'gateron-yellow', name: 'Gateron Yellow', actuation: 50, description: '50g linear' },
    { id: 'kailh-pink', name: 'Kailh Pink / Choc', actuation: 20, description: '20g linear' },
];

const getWristStatus = (angle: number | null): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } | null => {
    if (angle === null) return null;
    const absAngle = Math.abs(angle);
    if (absAngle <= 10) return { label: "Good", variant: "default" };
    if (absAngle <= 20) return { label: "Warning", variant: "secondary" };
    return { label: "Poor", variant: "destructive" };
};

const getPronationStatus = (angle: number | null): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } | null => {
    if (angle === null) return null;
    const absAngle = Math.abs(angle);
    if (absAngle >= 20 && absAngle <= 40) return { label: "Good", variant: "default" };
    if ((absAngle >= 10 && absAngle < 20) || (absAngle > 40 && absAngle <= 50)) return { label: "Warning", variant: "secondary" };
    return { label: "Poor", variant: "destructive" };
};

const getExtensionStatus = (angle: number | null): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } | null => {
    if (angle === null) return null;
    const absAngle = Math.abs(angle);
    if (absAngle <= 5) return { label: "Good", variant: "default" };
    if (absAngle <= 15) return { label: "Warning", variant: "secondary" };
    return { label: "Poor", variant: "destructive" };
};

const generateRecommendations = (
    leftWrist: number | null,
    rightWrist: number | null,
    leftPronation: number | null,
    rightPronation: number | null,
    leftExtension: number | null,
    rightExtension: number | null
): string[] => {
    const tips: string[] = [];

    const avgWrist = [leftWrist, rightWrist].filter((a): a is number => a !== null);
    if (avgWrist.length > 0) {
        const maxDeviation = Math.max(...avgWrist.map(Math.abs));
        if (maxDeviation > 20) {
            tips.push("Your wrist deviation is high. Try positioning your hands directly in front of your shoulders to reduce side-to-side bending.");
        } else if (maxDeviation > 10) {
            tips.push("Slight wrist deviation detected. Consider adjusting your keyboard position for better alignment.");
        }
    }

    const pronations = [leftPronation, rightPronation].filter((a): a is number => a !== null);
    if (pronations.length > 0) {
        const avgPronation = pronations.reduce((a, b) => a + b, 0) / pronations.length;
        if (Math.abs(avgPronation) < 10 || Math.abs(avgPronation) > 50) {
            tips.push("Your forearm rotation is outside the comfortable range. Try tilting your keyboard or using a wrist rest to achieve a more neutral palm angle.");
        } else if (Math.abs(avgPronation) < 20 || Math.abs(avgPronation) > 40) {
            tips.push("Your palm angle could be improved. A slight tilt of your keyboard may help reduce forearm strain.");
        }
    }

    const extensions = [leftExtension, rightExtension].filter((a): a is number => a !== null);
    if (extensions.length > 0) {
        const maxExtension = Math.max(...extensions.map(Math.abs));
        if (maxExtension > 15) {
            tips.push("Your wrist is bent upward significantly. Try lowering your keyboard or removing keyboard feet to keep wrists flat.");
        } else if (maxExtension > 5) {
            tips.push("Slight wrist extension detected. Consider adjusting your keyboard height for a flatter wrist position.");
        }
    }

    if (tips.length === 0) {
        tips.push("Great job! Your typing posture looks good. Keep maintaining neutral wrist positions to prevent strain.");
    }

    return tips;
};

declare global {
    interface Window {
        Hands: new (config: { locateFile: (file: string) => string }) => MediaPipeHands;
        Pose: new (config: { locateFile: (file: string) => string }) => MediaPipePose;
        HAND_CONNECTIONS: [number, number][];
        POSE_CONNECTIONS: [number, number][];
        drawConnectors: DrawingFunction;
        drawLandmarks: LandmarkDrawFunction;
    }
}

// QWERTY fallback when tracking fails
const fingerMap: { [key: string]: string } = {
    // Left hand
    q: "L-Pinky", w: "L-Ring", e: "L-Middle", r: "L-Index", t: "L-Index",
    a: "L-Pinky", s: "L-Ring", d: "L-Middle", f: "L-Index", g: "L-Index",
    z: "L-Pinky", x: "L-Ring", c: "L-Middle", v: "L-Index", b: "L-Index",
    "1": "L-Pinky", "2": "L-Ring", "3": "L-Middle", "4": "L-Index", "5": "L-Index",
    "`": "L-Pinky",

    // Right hand
    y: "R-Index", u: "R-Index", i: "R-Middle", o: "R-Ring", p: "R-Pinky",
    h: "R-Index", j: "R-Index", k: "R-Middle", l: "R-Ring", ";": "R-Pinky",
    n: "R-Index", m: "R-Index", ",": "R-Middle", ".": "R-Ring", "/": "R-Pinky",
    "6": "R-Index", "7": "R-Index", "8": "R-Middle", "9": "R-Ring", "0": "R-Pinky",
    "-": "R-Pinky", "=": "R-Pinky", "[": "R-Pinky", "]": "R-Pinky", "\\": "R-Pinky",
    "'": "R-Pinky",

    // Thumbs
    " ": "R-Thumb",

    // Modifier keys
    "shift": "L-Pinky",
    "control": "L-Pinky",
    "alt": "L-Thumb",
    "meta": "L-Thumb",
    "capslock": "L-Pinky",
    "backspace": "R-Ring",
};

const TEST_SENTENCES = [
    "The quick brown fox jumps over the lazy dog. This sentence contains every letter of the alphabet.",
    "Programming is the art of telling a computer what to do through a series of instructions.",
    "Practice makes perfect, but nobody is perfect, so why practice? Just kidding, keep typing!",
    "The five boxing wizards jump quickly at dawn while the lazy dog sleeps peacefully nearby.",
    "She sells seashells by the seashore, and the shells she sells are seashells for sure.",
    "How vexingly quick daft zebras jump! Pack my box with five dozen liquor jugs.",
    "A journey of a thousand miles begins with a single step, so start typing right now.",
    "To be or not to be, that is the question whether it is nobler in the mind to suffer.",
    "All that glitters is not gold; often have you heard that told. Many a man his life hath sold.",
    "The rain in Spain stays mainly in the plain, but the weather in Seattle is quite different.",
];

interface Keystroke {
    key: string;
    finger: string;
    timestamp: number;
    isCorrect: boolean;
    shifted?: boolean;
    leftWristAngle?: number;
    rightWristAngle?: number;
    leftPronation?: number;
    rightPronation?: number;
    leftExtension?: number;
    rightExtension?: number;
}

export default function Home() {
    const POSE_SMOOTHING_WINDOW = 10;       // Frames for forearm smoothing
    const ANGLE_SMOOTHING_WINDOW = 15;      // Frames for angle smoothing
    const MAX_POSE_DELTA = 0.15;            // Max position jump per frame
    const MAX_ANGLE_DELTA = 50;             // Max angle jump per frame
    const FINGER_JITTER_THRESHOLD = 0.005;  // Min movement to count

    const [targetText, setTargetText] = useState(TEST_SENTENCES[0]);

    const [userInput, setUserInput] = useState("");
    const [keystrokes, setKeystrokes] = useState<Keystroke[]>([]);
    const [startTime, setStartTime] = useState<number | null>(null);
    const [wpm, setWpm] = useState(0);
    const [accuracy, setAccuracy] = useState(100);
    const [totalKeystrokesTyped, setTotalKeystrokesTyped] = useState(0);
    const [totalErrors, setTotalErrors] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isFinished, setIsFinished] = useState(false);
    const [showRecommendations, setShowRecommendations] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [leftWristAngle, setLeftWristAngle] = useState<number | null>(null);
    const [rightWristAngle, setRightWristAngle] = useState<number | null>(null);
    const [avgLeftWristAngle, setAvgLeftWristAngle] = useState<number | null>(null);
    const [avgRightWristAngle, setAvgRightWristAngle] = useState<number | null>(null);

    // Pronation/supination angles
    const [leftPronation, setLeftPronation] = useState<number | null>(null);
    const [rightPronation, setRightPronation] = useState<number | null>(null);
    const [avgLeftPronation, setAvgLeftPronation] = useState<number | null>(null);
    const [avgRightPronation, setAvgRightPronation] = useState<number | null>(null);

    // Wrist extension/flexion angles (up/down bending)
    const [leftExtension, setLeftExtension] = useState<number | null>(null);
    const [rightExtension, setRightExtension] = useState<number | null>(null);
    const [avgLeftExtension, setAvgLeftExtension] = useState<number | null>(null);
    const [avgRightExtension, setAvgRightExtension] = useState<number | null>(null);

    // Finger travel tracking
    const [leftFingerTravel, setLeftFingerTravel] = useState<number>(0);
    const [rightFingerTravel, setRightFingerTravel] = useState<number>(0);

    const [handsDetected, setHandsDetected] = useState<number>(0);

    const [freeMode, setFreeMode] = useState(false);
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Keyboard preset selection for strain calculation
    const [selectedKeyboard, setSelectedKeyboard] = useState(KEYBOARD_PRESETS[0]);

    // Finger usage tracking 
    const [fingerUsage, setFingerUsage] = useState<{ [finger: string]: number }>({
        'L-Pinky': 0, 'L-Ring': 0, 'L-Middle': 0, 'L-Index': 0, 'L-Thumb': 0,
        'R-Thumb': 0, 'R-Index': 0, 'R-Middle': 0, 'R-Ring': 0, 'R-Pinky': 0,
    });

    // Fingertip position history for velocity based finger detection
    const fingertipHistory = useRef<{
        left: { [finger: string]: { y: number; z: number; timestamp: number }[] };
        right: { [finger: string]: { y: number; z: number; timestamp: number }[] };
    }>({
        left: { thumb: [], index: [], middle: [], ring: [], pinky: [] },
        right: { thumb: [], index: [], middle: [], ring: [], pinky: [] },
    });

    const handsRef = useRef<any>(null);
    const poseRef = useRef<any>(null);
    const animationFrameRef = useRef<number | null>(null);
    const [mediapipeLoaded, setMediapipeLoaded] = useState(false);

    // Pose landmarks from MediaPipe
    const poseLeftElbow = useRef<{ x: number, y: number, z: number } | null>(null);
    const poseRightElbow = useRef<{ x: number, y: number, z: number } | null>(null);
    const poseLeftWrist = useRef<{ x: number, y: number, z: number } | null>(null);
    const poseRightWrist = useRef<{ x: number, y: number, z: number } | null>(null);

    // Smoothing history buffers
    const leftAngleHistory = useRef<number[]>([]);
    const rightAngleHistory = useRef<number[]>([]);
    const leftElbowHistory = useRef<{ x: number, y: number, z: number }[]>([]);
    const rightElbowHistory = useRef<{ x: number, y: number, z: number }[]>([]);
    const leftWristHistory = useRef<{ x: number, y: number, z: number }[]>([]);
    const rightWristHistory = useRef<{ x: number, y: number, z: number }[]>([]);
    const leftPronationHistory = useRef<number[]>([]);
    const rightPronationHistory = useRef<number[]>([]);
    const leftExtensionHistory = useRef<number[]>([]);
    const rightExtensionHistory = useRef<number[]>([]);

    // Calibration baselines 
    const leftWristBaseline = useRef<number | null>(null);
    const rightWristBaseline = useRef<number | null>(null);
    const leftPronationBaseline = useRef<number | null>(null);
    const rightPronationBaseline = useRef<number | null>(null);
    const leftExtensionBaseline = useRef<number | null>(null);
    const rightExtensionBaseline = useRef<number | null>(null);
    const baselineCalibrated = useRef(false);
    const calibrationResetTime = useRef<number>(Date.now());

    // Finger travel tracking
    const prevLeftFingertips = useRef<{ x: number, y: number }[] | null>(null);
    const prevRightFingertips = useRef<{ x: number, y: number }[] | null>(null);
    const testActiveRef = useRef(false);

    useEffect(() => {
        containerRef.current?.focus();
    }, []);

    useEffect(() => {
        setMounted(true);
    }, []);

    const smoothAngle = (
        newAngle: number,
        history: number[],
        windowSize: number,
        maxDelta: number = 50
    ): number => {
        if (!isOutlier(newAngle, history, maxDelta)) {
            history.push(newAngle);
            if (history.length > windowSize) {
                history.shift();
            }
        }

        if (history.length === 0) return 0;

        const sorted = [...history].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);

        return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    };

    // Normalize angle difference to handle wrapping at 180 degree boundary
    const normalizeAngleDifference = (current: number, baseline: number): number => {
        let diff = current - baseline;

        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;

        return diff;
    };

    // Detect and reject outlier angles based on frame-to-frame velocity
    const isOutlier = (
        newAngle: number,
        history: number[],
        maxDeltaPerFrame: number = 50
    ): boolean => {
        if (history.length === 0) return false;

        const lastAngle = history[history.length - 1];
        const delta = Math.abs(normalizeAngleDifference(newAngle, lastAngle));

        return delta > maxDeltaPerFrame;
    };

    const median = (arr: number[]): number => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    };

    // Smooth 3D position using median filter (for pose landmarks)
    const smoothPosition = (
        newPos: { x: number, y: number, z: number },
        history: { x: number, y: number, z: number }[],
        windowSize: number,
        maxDelta: number = 0.15
    ): { x: number, y: number, z: number } => {
        // Outlier rejection: check if position jumped too far
        if (history.length > 0) {
            const last = history[history.length - 1];
            const dist = Math.sqrt(
                (newPos.x - last.x) ** 2 +
                (newPos.y - last.y) ** 2
            );
            // If position jumped too far, skip this frame 
            if (dist > maxDelta) {
                return history.length > 0 ? {
                    x: median(history.map(p => p.x)),
                    y: median(history.map(p => p.y)),
                    z: median(history.map(p => p.z))
                } : newPos;
            }
        }

        history.push(newPos);
        if (history.length > windowSize) {
            history.shift();
        }

        return {
            x: median(history.map(p => p.x)),
            y: median(history.map(p => p.y)),
            z: median(history.map(p => p.z))
        };
    };

    // 2D signed angle for ulnar/radial deviation
    const calculateWrist2DAngle = (
        handLandmarks: Landmark[],
        isRightHand: boolean,
        poseElbowRef: React.MutableRefObject<{ x: number, y: number, z: number } | null>,
        poseWristRef: React.MutableRefObject<{ x: number, y: number, z: number } | null>
    ): number => {
        // Check if we have pose data
        if (!poseElbowRef.current || !poseWristRef.current) {
            return 0;
        }
        // Hand landmark 0 = wrist
        const handWrist = handLandmarks[0];
        // Hand landmark 9 = middle finger MCP
        const middleMCP = handLandmarks[9];

        // Vector 1: Forearm (elbow → wrist) from Pose 
        const forearm = {
            x: poseWristRef.current.x - poseElbowRef.current.x,
            y: poseWristRef.current.y - poseElbowRef.current.y
        };

        // Vector 2: Hand (wrist → middle MCP) from Hands 
        const hand = {
            x: middleMCP.x - handWrist.x,
            y: middleMCP.y - handWrist.y
        };

        // Calculate signed angle between vectors using atan2
        const cross = forearm.x * hand.y - forearm.y * hand.x;
        const dot = forearm.x * hand.x + forearm.y * hand.y;
        const angleRad = Math.atan2(cross, dot);
        const angleDeg = angleRad * (180 / Math.PI);

        // - Negative = Ulnar deviation (toward pinky) - bad for RSI
        // - Positive = Radial deviation (toward thumb)
        return isRightHand ? angleDeg : -angleDeg;
    };

    // Palm rotation angle (pronation = palm down, supination = palm up)
    const calculatePronationAngle = (landmarks: Landmark[], isRightHand: boolean): number => {
        const indexMCP = landmarks[5];   // thumb side
        const pinkyMCP = landmarks[17];  // pinky side
        const zDiff = indexMCP.z - pinkyMCP.z;  // negative Z = closer to camera

        // Normalize by hand width for consistent measurement
        const handWidth = Math.sqrt(
            (indexMCP.x - pinkyMCP.x) ** 2 +
            (indexMCP.y - pinkyMCP.y) ** 2
        );
        if (handWidth < 0.01) return 0;

        const angleRad = Math.atan2(zDiff, handWidth);
        let angleDeg = angleRad * (180 / Math.PI);

        if (!isRightHand) {
            angleDeg = -angleDeg;
        }

        return angleDeg;
    };

    // Vertical wrist bend (+ = extension/up, - = flexion/down)
    const calculateExtensionAngle = (
        handLandmarks: Landmark[],
        poseElbowRef: React.MutableRefObject<{ x: number, y: number, z: number } | null>,
        poseWristRef: React.MutableRefObject<{ x: number, y: number, z: number } | null>,
        isRightHand: boolean
    ): number => {
        if (!poseElbowRef.current || !poseWristRef.current) return 0;

        // Forearm vector (Y-Z plane for extension/flexion)
        const forearm = {
            y: poseWristRef.current.y - poseElbowRef.current.y,
            z: poseWristRef.current.z - poseElbowRef.current.z
        };

        // Hand vector: wrist → middle MCP
        const wrist = handLandmarks[0];
        const middleMCP = handLandmarks[9];
        const hand = {
            y: middleMCP.y - wrist.y,
            z: middleMCP.z - wrist.z
        };

        // Calculate signed angle using atan2
        const forearmAngle = Math.atan2(forearm.z, forearm.y);
        const handAngle = Math.atan2(hand.z, hand.y);
        let angleDeg = (handAngle - forearmAngle) * (180 / Math.PI);

        // Normalize to reasonable range
        if (angleDeg > 90) angleDeg -= 180;
        if (angleDeg < -90) angleDeg += 180;

        // Flip for consistency between hands
        return isRightHand ? angleDeg : -angleDeg;
    };

    // Sum of fingertip movement distances between frames
    const calculateFingerTravel = (
        currentLandmarks: Landmark[],
        prevPositions: { x: number, y: number }[] | null
    ): { distance: number, newPositions: { x: number, y: number }[] } => {
        const fingertipIndices = [4, 8, 12, 16, 20];  // thumb, index, middle, ring, pinky

        const currentPositions = fingertipIndices.map(i => ({
            x: currentLandmarks[i].x,
            y: currentLandmarks[i].y
        }));

        if (!prevPositions) {
            return { distance: 0, newPositions: currentPositions };
        }

        let totalDistance = 0;
        for (let i = 0; i < 5; i++) {
            const dx = currentPositions[i].x - prevPositions[i].x;
            const dy = currentPositions[i].y - prevPositions[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > FINGER_JITTER_THRESHOLD) {
                totalDistance += dist;
            }
        }

        return { distance: totalDistance, newPositions: currentPositions };
    };

    // Detect pressing finger from 50-200ms movement history
    const detectPressingFinger = (): string => {
        const now = Date.now();
        const lookbackStart = 200;
        const lookbackEnd = 50;

        let maxDisplacement = 0;
        let detectedFinger = 'Unknown';

        for (const hand of ['left', 'right'] as const) {
            for (const finger of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
                const history = fingertipHistory.current[hand][finger];
                if (history.length < 3) continue;

                // Get positions from the lookback window (50-150ms ago)
                const windowStart = history.filter(h =>
                    now - h.timestamp <= lookbackStart &&
                    now - h.timestamp > lookbackEnd
                );
                const windowEnd = history.filter(h =>
                    now - h.timestamp <= lookbackEnd
                );

                if (windowStart.length === 0 || windowEnd.length === 0) continue;

                // Get earliest position in window and latest position
                const startPos = windowStart[0];
                const endPos = windowEnd[windowEnd.length - 1];

                // Calculate displacement (how much the finger moved down)
                const yDisplacement = endPos.y - startPos.y;  // positive = moved down
                const zDisplacement = endPos.z - startPos.z;  // positive = moved toward keyboard

                // Combined displacement score
                const displacement = (yDisplacement * 0.3) + (zDisplacement * 0.7);

                if (displacement > maxDisplacement) {
                    maxDisplacement = displacement;
                    const fingerName = hand === 'left'
                        ? `L-${finger.charAt(0).toUpperCase() + finger.slice(1)}`
                        : `R-${finger.charAt(0).toUpperCase() + finger.slice(1)}`;
                    detectedFinger = fingerName;
                }
            }
        }

        return detectedFinger;
    };

    // Process Pose results for forearm direction
    const onPoseResults = useCallback((results: PoseResults) => {
        if (results.poseLandmarks && results.poseLandmarks.length > 0) {
            const landmarks = results.poseLandmarks;

            const leftShoulder = landmarks[11] ? { x: landmarks[11].x, y: landmarks[11].y } : null;
            const rightShoulder = landmarks[12] ? { x: landmarks[12].x, y: landmarks[12].y } : null;
            const elbow13 = landmarks[13] ? { x: landmarks[13].x, y: landmarks[13].y, z: landmarks[13].z } : null;
            const elbow14 = landmarks[14] ? { x: landmarks[14].x, y: landmarks[14].y, z: landmarks[14].z } : null;
            const wrist15 = landmarks[15] ? { x: landmarks[15].x, y: landmarks[15].y, z: landmarks[15].z } : null;
            const wrist16 = landmarks[16] ? { x: landmarks[16].x, y: landmarks[16].y, z: landmarks[16].z } : null;

            if (wrist15 && wrist16 && elbow13 && elbow14) {
                // Use shoulders to establish body midline for more reliable hand assignment
                // This handles off-center users better than comparing wrist positions directly
                let wrist15IsLeft: boolean;
                if (leftShoulder && rightShoulder) {
                    // Body midline is between shoulders (in mirrored view, left shoulder has higher x)
                    const bodyMidline = (leftShoulder.x + rightShoulder.x) / 2;
                    // In mirrored view: user's left hand is on RIGHT side of image (higher x)
                    wrist15IsLeft = wrist15.x > bodyMidline;
                } else {
                    // Fallback: compare wrist positions when shoulders not visible
                    wrist15IsLeft = wrist15.x > wrist16.x;
                }

                if (wrist15IsLeft) {
                    // wrist15/elbow13 is user's LEFT arm (right side of image)
                    // wrist16/elbow14 is user's RIGHT arm (left side of image)
                    poseLeftElbow.current = smoothPosition(elbow13, leftElbowHistory.current, POSE_SMOOTHING_WINDOW, MAX_POSE_DELTA);
                    poseLeftWrist.current = smoothPosition(wrist15, leftWristHistory.current, POSE_SMOOTHING_WINDOW, MAX_POSE_DELTA);
                    poseRightElbow.current = smoothPosition(elbow14, rightElbowHistory.current, POSE_SMOOTHING_WINDOW, MAX_POSE_DELTA);
                    poseRightWrist.current = smoothPosition(wrist16, rightWristHistory.current, POSE_SMOOTHING_WINDOW, MAX_POSE_DELTA);
                } else {
                    // wrist16/elbow14 is user's LEFT arm (right side of image)
                    // wrist15/elbow13 is user's RIGHT arm (left side of image)
                    poseLeftElbow.current = smoothPosition(elbow14, leftElbowHistory.current, POSE_SMOOTHING_WINDOW, MAX_POSE_DELTA);
                    poseLeftWrist.current = smoothPosition(wrist16, leftWristHistory.current, POSE_SMOOTHING_WINDOW, MAX_POSE_DELTA);
                    poseRightElbow.current = smoothPosition(elbow13, rightElbowHistory.current, POSE_SMOOTHING_WINDOW, MAX_POSE_DELTA);
                    poseRightWrist.current = smoothPosition(wrist15, rightWristHistory.current, POSE_SMOOTHING_WINDOW, MAX_POSE_DELTA);
                }
            } else {
                // Only one or no arms detected - use MediaPipe's default assignment with smoothing
                if (elbow13) {
                    poseLeftElbow.current = smoothPosition(elbow13, leftElbowHistory.current, POSE_SMOOTHING_WINDOW, MAX_POSE_DELTA);
                }
                if (elbow14) {
                    poseRightElbow.current = smoothPosition(elbow14, rightElbowHistory.current, POSE_SMOOTHING_WINDOW, MAX_POSE_DELTA);
                }
                if (wrist15) {
                    poseLeftWrist.current = smoothPosition(wrist15, leftWristHistory.current, POSE_SMOOTHING_WINDOW, MAX_POSE_DELTA);
                }
                if (wrist16) {
                    poseRightWrist.current = smoothPosition(wrist16, rightWristHistory.current, POSE_SMOOTHING_WINDOW, MAX_POSE_DELTA);
                }
            }
        }
    }, []);

    const onHandsResults = useCallback((results: HandsResults) => {
        if (!canvasRef.current) return;

        const canvasCtx = canvasRef.current.getContext('2d');
        if (!canvasCtx) return;

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        if (results.image) {
            canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);
        }

        if (results.multiHandLandmarks && results.multiHandedness && results.multiHandLandmarks.length > 0) {
            setHandsDetected(results.multiHandLandmarks.length);
        } else {
            setHandsDetected(0);
        }

        if (results.multiHandLandmarks && results.multiHandedness) {

            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                const landmarks = results.multiHandLandmarks[i];
                const handedness = results.multiHandedness[i].label;

                // Validate landmark coordinates (skip if any are NaN or Infinity)
                const hasValidCoords = landmarks.every((lm: Landmark) =>
                    isFinite(lm.x) && isFinite(lm.y) && isFinite(lm.z)
                );
                if (!hasValidCoords) continue;

                // Draw hand landmarks
                // MediaPipe handedness is mirrored: "Left" = user's RIGHT hand, "Right" = user's LEFT hand
                // Color: Green for LEFT hand, Red for RIGHT hand
                const overlayColor = handedness === 'Left' ? '#FF0000' : '#00FF00';
                window.drawConnectors(canvasCtx, landmarks, window.HAND_CONNECTIONS, {
                    color: overlayColor,
                    lineWidth: 2
                });
                window.drawLandmarks(canvasCtx, landmarks, {
                    color: overlayColor,
                    lineWidth: 1,
                    radius: 3
                });

                // MediaPipe handedness is mirrored: "Left" = user's RIGHT hand
                const isRightHand = handedness === 'Left';

                const deviation = isRightHand
                    ? calculateWrist2DAngle(landmarks, true, poseRightElbow, poseRightWrist)
                    : calculateWrist2DAngle(landmarks, false, poseLeftElbow, poseLeftWrist);

                // Apply temporal smoothing
                // MediaPipe handedness is mirrored (camera perspective):
                if (handedness === 'Left') {
                    const smoothedAngle = smoothAngle(deviation, rightAngleHistory.current, ANGLE_SMOOTHING_WINDOW, MAX_ANGLE_DELTA);

                    // Calibration: capture baseline on first stable reading
                    // Wait 500ms after reset to let hand tracking stabilize before capturing baseline
                    const calibrationDelay = 500; // ms
                    const canCalibrate = !baselineCalibrated.current &&
                        rightAngleHistory.current.length >= ANGLE_SMOOTHING_WINDOW &&
                        Date.now() - calibrationResetTime.current >= calibrationDelay;
                    if (canCalibrate && rightWristBaseline.current === null) {
                        rightWristBaseline.current = smoothedAngle;
                    }

                    // Subtract baseline if calibrated (using normalized difference to handle angle wrapping)
                    const calibratedAngle = rightWristBaseline.current !== null
                        ? normalizeAngleDifference(smoothedAngle, rightWristBaseline.current)
                        : smoothedAngle;

                    setRightWristAngle(Math.round(calibratedAngle));

                    // Calculate pronation angle for right hand
                    const pronationRaw = calculatePronationAngle(landmarks, true);
                    const smoothedPronation = smoothAngle(pronationRaw, rightPronationHistory.current, ANGLE_SMOOTHING_WINDOW, MAX_ANGLE_DELTA);

                    // Calibration for pronation
                    if (rightPronationBaseline.current === null && rightPronationHistory.current.length >= ANGLE_SMOOTHING_WINDOW) {
                        rightPronationBaseline.current = smoothedPronation;
                    }

                    const calibratedPronation = rightPronationBaseline.current !== null
                        ? normalizeAngleDifference(smoothedPronation, rightPronationBaseline.current)
                        : smoothedPronation;

                    setRightPronation(Math.round(calibratedPronation));

                    // Calculate extension angle for right hand
                    const extensionRaw = calculateExtensionAngle(landmarks, poseRightElbow, poseRightWrist, true);
                    const smoothedExtension = smoothAngle(extensionRaw, rightExtensionHistory.current, ANGLE_SMOOTHING_WINDOW, MAX_ANGLE_DELTA);

                    // Calibration for extension
                    if (rightExtensionBaseline.current === null && rightExtensionHistory.current.length >= ANGLE_SMOOTHING_WINDOW) {
                        rightExtensionBaseline.current = smoothedExtension;
                    }

                    const calibratedExtension = rightExtensionBaseline.current !== null
                        ? normalizeAngleDifference(smoothedExtension, rightExtensionBaseline.current)
                        : smoothedExtension;

                    setRightExtension(Math.round(calibratedExtension));
                } else {
                    const smoothedAngle = smoothAngle(deviation, leftAngleHistory.current, ANGLE_SMOOTHING_WINDOW, MAX_ANGLE_DELTA);

                    // Calibration: capture baseline on first stable reading
                    // Wait 500ms after reset to let hand tracking stabilize before capturing baseline
                    const calibrationDelay = 500; // ms
                    const canCalibrate = !baselineCalibrated.current &&
                        leftAngleHistory.current.length >= ANGLE_SMOOTHING_WINDOW &&
                        Date.now() - calibrationResetTime.current >= calibrationDelay;
                    if (canCalibrate && leftWristBaseline.current === null) {
                        leftWristBaseline.current = smoothedAngle;
                    }

                    // Subtract baseline if calibrated (using normalized difference to handle angle wrapping)
                    const calibratedAngle = leftWristBaseline.current !== null
                        ? normalizeAngleDifference(smoothedAngle, leftWristBaseline.current)
                        : smoothedAngle;

                    setLeftWristAngle(Math.round(calibratedAngle)); // Actually left hand

                    // Calculate pronation angle for left hand
                    const pronationRaw = calculatePronationAngle(landmarks, false);
                    const smoothedPronation = smoothAngle(pronationRaw, leftPronationHistory.current, ANGLE_SMOOTHING_WINDOW, MAX_ANGLE_DELTA);

                    // Calibration for pronation
                    if (leftPronationBaseline.current === null && leftPronationHistory.current.length >= ANGLE_SMOOTHING_WINDOW) {
                        leftPronationBaseline.current = smoothedPronation;
                    }

                    const calibratedPronation = leftPronationBaseline.current !== null
                        ? normalizeAngleDifference(smoothedPronation, leftPronationBaseline.current)
                        : smoothedPronation;

                    setLeftPronation(Math.round(calibratedPronation));

                    // Calculate extension angle for left hand
                    const extensionRaw = calculateExtensionAngle(landmarks, poseLeftElbow, poseLeftWrist, false);
                    const smoothedExtension = smoothAngle(extensionRaw, leftExtensionHistory.current, ANGLE_SMOOTHING_WINDOW, MAX_ANGLE_DELTA);

                    // Calibration for extension
                    if (leftExtensionBaseline.current === null && leftExtensionHistory.current.length >= ANGLE_SMOOTHING_WINDOW) {
                        leftExtensionBaseline.current = smoothedExtension;
                    }

                    const calibratedExtension = leftExtensionBaseline.current !== null
                        ? normalizeAngleDifference(smoothedExtension, leftExtensionBaseline.current)
                        : smoothedExtension;

                    setLeftExtension(Math.round(calibratedExtension));
                }

                // Calculate finger travel distance (only during active test)
                const prevPositions = isRightHand ? prevRightFingertips.current : prevLeftFingertips.current;
                const { distance, newPositions } = calculateFingerTravel(landmarks, prevPositions);

                if (isRightHand) {
                    prevRightFingertips.current = newPositions;
                    if (testActiveRef.current) {
                        setRightFingerTravel(prev => prev + distance);
                    }
                } else {
                    prevLeftFingertips.current = newPositions;
                    if (testActiveRef.current) {
                        setLeftFingerTravel(prev => prev + distance);
                    }
                }

                const fingertipIndices = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
                const now = Date.now();
                const hand = isRightHand ? 'right' : 'left';

                for (const [fingerName, idx] of Object.entries(fingertipIndices)) {
                    const y = landmarks[idx].y;
                    const z = landmarks[idx].z;
                    const history = fingertipHistory.current[hand][fingerName];

                    history.push({ y, z, timestamp: now });
                    if (history.length > 10) history.shift();
                }

                // Mark as calibrated once at least one hand has baseline
                if (!baselineCalibrated.current &&
                    (leftWristBaseline.current !== null || rightWristBaseline.current !== null)) {
                    baselineCalibrated.current = true;
                }
            }
        }

        // Draw after hands so they appear on top and aren't cleared
        const canvas = canvasRef.current;

        // draw a landmark circle
        const drawPoseLandmark = (lm: { x: number, y: number, z: number } | null, color: string) => {
            if (!lm || !canvas) return;
            const x = lm.x * canvas.width;
            const y = lm.y * canvas.height;

            canvasCtx.beginPath();
            canvasCtx.arc(x, y, 8, 0, 2 * Math.PI);
            canvasCtx.fillStyle = color;
            canvasCtx.fill();
            canvasCtx.strokeStyle = 'white';
            canvasCtx.lineWidth = 2;
            canvasCtx.stroke();
        };

        // draw forearm vector line
        const drawForearmVector = (
            elbow: { x: number, y: number, z: number } | null,
            wrist: { x: number, y: number, z: number } | null,
            color: string
        ) => {
            if (!elbow || !wrist || !canvas) return;
            const x1 = elbow.x * canvas.width;
            const y1 = elbow.y * canvas.height;
            const x2 = wrist.x * canvas.width;
            const y2 = wrist.y * canvas.height;

            canvasCtx.beginPath();
            canvasCtx.moveTo(x1, y1);
            canvasCtx.lineTo(x2, y2);
            canvasCtx.strokeStyle = color;
            canvasCtx.lineWidth = 4;
            canvasCtx.stroke();
        };

        // Draw left arm landmarks (user's right hand - cyan/blue tones)
        drawPoseLandmark(poseLeftElbow.current, '#00FFFF');  // Left elbow - cyan
        drawPoseLandmark(poseLeftWrist.current, '#0088FF');  // Left wrist - blue
        drawForearmVector(poseLeftElbow.current, poseLeftWrist.current, '#00AAFF'); // Left forearm - light blue

        // Draw right arm landmarks (user's left hand - yellow/orange tones)
        drawPoseLandmark(poseRightElbow.current, '#FFFF00');  // Right elbow - yellow
        drawPoseLandmark(poseRightWrist.current, '#FFAA00');  // Right wrist - orange
        drawForearmVector(poseRightElbow.current, poseRightWrist.current, '#FFD700'); // Right forearm - gold

        canvasCtx.restore();
    }, []);

    // MediaPipe Hands and Pose when libraries are loaded
    useEffect(() => {
        if (!mediapipeLoaded || !window.Hands || !window.Pose) return;

        const initializeTracking = async () => {
            // Initialize Pose for forearm tracking (elbow -> wrist)
            const pose = new window.Pose({
                locateFile: (file: string) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
                }
            });

            pose.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                enableSegmentation: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            pose.onResults(onPoseResults);
            poseRef.current = pose;

            // Initialize Hands for hand tracking and wrist angle detection
            const hands = new window.Hands({
                locateFile: (file: string) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });

            hands.setOptions({
                maxNumHands: 2,
                modelComplexity: 1,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            hands.onResults(onHandsResults);
            handsRef.current = hands;

            // Start camera
            if (videoRef.current) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 1280 },
                            height: { ideal: 720 }
                        }
                    });
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                    setCameraActive(true);

                    // Process frames using requestAnimationFrame
                    const processFrame = async () => {
                        if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
                            // Send frame to Pose 
                            if (poseRef.current) {
                                await poseRef.current.send({ image: videoRef.current });
                            }
                            // Send to Hands 
                            if (handsRef.current) {
                                await handsRef.current.send({ image: videoRef.current });
                            }
                        }
                        animationFrameRef.current = requestAnimationFrame(processFrame);
                    };
                    processFrame();
                } catch (err) {
                    console.error("Error accessing camera:", err);
                    setCameraError(err instanceof Error ? err.message : "Camera access denied");
                }
            }
        };

        initializeTracking();

        // Cleanup
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (videoRef.current && videoRef.current.srcObject) {
                const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
                tracks.forEach(track => track.stop());
            }
            if (handsRef.current) {
                handsRef.current.close();
            }
            if (poseRef.current) {
                poseRef.current.close();
            }
        };
    }, [mediapipeLoaded, onHandsResults, onPoseResults]);

    useEffect(() => {
        if (!startTime || keystrokes.length === 0 || isFinished) return;

        const interval = setInterval(() => {
            const now = Date.now();
            const timeElapsed = (now - startTime) / 1000 / 60;

            if (timeElapsed > 0) {
                const charactersTyped = userInput.length;
                const calculatedWpm = Math.round((charactersTyped / 5) / timeElapsed);
                setWpm(calculatedWpm);
            }

            // Calculate accuracy from total keystrokes typed (including corrected errors)
            const calculatedAccuracy = totalKeystrokesTyped > 0
                ? Math.round(((totalKeystrokesTyped - totalErrors) / totalKeystrokesTyped) * 100)
                : 100;
            setAccuracy(calculatedAccuracy);
        }, 500);

        return () => clearInterval(interval);
    }, [startTime, keystrokes, userInput, isFinished, totalKeystrokesTyped, totalErrors]);

    const [showResetDialog, setShowResetDialog] = useState(false);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            setShowResetDialog(true);
            return;
        }

        if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta" || e.key === "CapsLock") {
            // Count modifier keys as keystrokes for strain calculation
            if (startTime) {
                setTotalKeystrokesTyped(prev => prev + 1);

                // Track finger usage (hybrid: detect or use assumed)
                const detectedFinger = detectPressingFinger();
                const finger = (detectedFinger !== 'Unknown')
                    ? detectedFinger
                    : (fingerMap[e.key.toLowerCase()] || 'Unknown');
                setFingerUsage(prev => ({
                    ...prev,
                    [finger]: (prev[finger] || 0) + 1
                }));
            }
            return;
        }

        if (e.key === "Backspace") {
            e.preventDefault();
            // Count backspace as keystroke for strain calculation
            if (startTime) {
                setTotalKeystrokesTyped(prev => prev + 1);

                // Track finger usage (hybrid: detect or use assumed)
                const detectedFinger = detectPressingFinger();
                const finger = (detectedFinger !== 'Unknown')
                    ? detectedFinger
                    : (fingerMap["backspace"] || 'R-Pinky');
                setFingerUsage(prev => ({
                    ...prev,
                    [finger]: (prev[finger] || 0) + 1
                }));
            }
            if (userInput.length > 0) {
                if (e.ctrlKey || e.metaKey) {
                    let newInput = userInput;
                    let charsToDelete = 0;
                    let i = newInput.length - 1;
                    while (i >= 0 && newInput[i] === ' ') {
                        i--;
                        charsToDelete++;
                    }
                    while (i >= 0 && newInput[i] !== ' ') {
                        i--;
                        charsToDelete++;
                    }
                    setUserInput(newInput.slice(0, newInput.length - charsToDelete));
                    setKeystrokes(prev => prev.slice(0, prev.length - charsToDelete));
                } else {
                    setUserInput(userInput.slice(0, -1));
                    setKeystrokes(prev => prev.slice(0, -1));
                }
                setIsFinished(false);
            }
            return;
        }

        if (!startTime) {
            if (freeMode) {
                setFreeMode(false);
                // Reset tracking baselines for fresh measurement
                leftWristBaseline.current = null;
                rightWristBaseline.current = null;
                leftPronationBaseline.current = null;
                rightPronationBaseline.current = null;
                leftExtensionBaseline.current = null;
                rightExtensionBaseline.current = null;
                baselineCalibrated.current = false;
                calibrationResetTime.current = Date.now();
                // Clear smoothing history
                leftAngleHistory.current = [];
                rightAngleHistory.current = [];
                leftPronationHistory.current = [];
                rightPronationHistory.current = [];
                leftExtensionHistory.current = [];
                rightExtensionHistory.current = [];
                // Reset finger travel
                setLeftFingerTravel(0);
                setRightFingerTravel(0);
                prevLeftFingertips.current = null;
                prevRightFingertips.current = null;
            }
            setStartTime(Date.now());
            testActiveRef.current = true; // Start tracking finger travel
        }

        if (userInput.length >= targetText.length) {
            return;
        }

        const expectedChar = targetText[userInput.length];
        const typedChar = e.key;
        const isCorrect = typedChar === expectedChar;

        // Hybrid finger detection: try hand tracking first, fall back to assumed mapping
        const detectedFinger = detectPressingFinger();
        const lowerKey = typedChar.toLowerCase();

        // Use detected finger if valid, otherwise fall back to assumed mapping
        const finger = (detectedFinger !== 'Unknown')
            ? detectedFinger
            : (fingerMap[lowerKey] || 'Unknown');

        setFingerUsage(prev => ({
            ...prev,
            [finger]: (prev[finger] || 0) + 1
        }));

        const newKeystroke: Keystroke = {
            key: typedChar,
            finger: finger,
            timestamp: Date.now(),
            isCorrect: isCorrect,
            shifted: e.shiftKey,
            leftWristAngle: leftWristAngle || undefined,
            rightWristAngle: rightWristAngle || undefined,
            leftPronation: leftPronation || undefined,
            rightPronation: rightPronation || undefined,
            leftExtension: leftExtension || undefined,
            rightExtension: rightExtension || undefined,
        };

        // Increment total keystrokes and errors
        setTotalKeystrokesTyped(prev => prev + 1);
        if (!isCorrect) {
            setTotalErrors(prev => prev + 1);
        }

        setUserInput(userInput + typedChar);

        // Use functional update to ensure we have the complete final keystroke array
        setKeystrokes((prev) => {
            const updatedKeystrokes = [...prev, newKeystroke];

            // Calculate average wrist angles if test is finishing
            if (userInput.length + 1 >= targetText.length) {
                const leftAngles = updatedKeystrokes
                    .map(k => k.leftWristAngle)
                    .filter((angle): angle is number => angle !== undefined);
                const rightAngles = updatedKeystrokes
                    .map(k => k.rightWristAngle)
                    .filter((angle): angle is number => angle !== undefined);

                if (leftAngles.length > 0) {
                    const avgLeft = leftAngles.reduce((sum, angle) => sum + angle, 0) / leftAngles.length;
                    setAvgLeftWristAngle(Math.round(avgLeft));
                }
                if (rightAngles.length > 0) {
                    const avgRight = rightAngles.reduce((sum, angle) => sum + angle, 0) / rightAngles.length;
                    setAvgRightWristAngle(Math.round(avgRight));
                }

                // Calculate average pronation angles
                const leftPronations = updatedKeystrokes
                    .map(k => k.leftPronation)
                    .filter((angle): angle is number => angle !== undefined);
                const rightPronations = updatedKeystrokes
                    .map(k => k.rightPronation)
                    .filter((angle): angle is number => angle !== undefined);

                if (leftPronations.length > 0) {
                    const avgLeftPron = leftPronations.reduce((sum, a) => sum + a, 0) / leftPronations.length;
                    setAvgLeftPronation(Math.round(avgLeftPron));
                }
                if (rightPronations.length > 0) {
                    const avgRightPron = rightPronations.reduce((sum, a) => sum + a, 0) / rightPronations.length;
                    setAvgRightPronation(Math.round(avgRightPron));
                }

                // Calculate average extension angles
                const leftExtensions = updatedKeystrokes
                    .map(k => k.leftExtension)
                    .filter((angle): angle is number => angle !== undefined);
                const rightExtensions = updatedKeystrokes
                    .map(k => k.rightExtension)
                    .filter((angle): angle is number => angle !== undefined);

                if (leftExtensions.length > 0) {
                    const avgLeftExt = leftExtensions.reduce((sum, a) => sum + a, 0) / leftExtensions.length;
                    setAvgLeftExtension(Math.round(avgLeftExt));
                }
                if (rightExtensions.length > 0) {
                    const avgRightExt = rightExtensions.reduce((sum, a) => sum + a, 0) / rightExtensions.length;
                    setAvgRightExtension(Math.round(avgRightExt));
                }
            }

            return updatedKeystrokes;
        });

        if (userInput.length + 1 >= targetText.length) {
            setIsFinished(true);
            setShowRecommendations(true); // Show posture recommendations
            testActiveRef.current = false; // Stop tracking finger travel
            const timeElapsed = (Date.now() - startTime!) / 1000 / 60;
            const finalWpm = Math.round(((userInput.length + 1) / 5) / timeElapsed);
            setWpm(finalWpm);
        }
    };

    const handleReset = () => {
        setUserInput("");
        setKeystrokes([]);
        setStartTime(null);
        setWpm(0);
        setAccuracy(100);
        setTotalKeystrokesTyped(0);
        setTotalErrors(0);
        setIsFinished(false);
        setShowRecommendations(false);
        setAvgLeftWristAngle(null);
        setAvgRightWristAngle(null);
        setAvgLeftPronation(null);
        setAvgRightPronation(null);
        setAvgLeftExtension(null);
        setAvgRightExtension(null);
        // Clear temporal smoothing history to prevent pollution from previous session
        leftAngleHistory.current = [];
        rightAngleHistory.current = [];
        leftPronationHistory.current = [];
        rightPronationHistory.current = [];
        leftExtensionHistory.current = [];
        rightExtensionHistory.current = [];
        // Reset calibration baseline for new session
        leftWristBaseline.current = null;
        rightWristBaseline.current = null;
        leftPronationBaseline.current = null;
        rightPronationBaseline.current = null;
        leftExtensionBaseline.current = null;
        rightExtensionBaseline.current = null;
        baselineCalibrated.current = false;
        calibrationResetTime.current = Date.now();
        // Reset finger travel tracking
        setLeftFingerTravel(0);
        setRightFingerTravel(0);
        prevLeftFingertips.current = null;
        prevRightFingertips.current = null;
        testActiveRef.current = false;
        // Reset finger usage tracking
        setFingerUsage({
            'L-Pinky': 0, 'L-Ring': 0, 'L-Middle': 0, 'L-Index': 0, 'L-Thumb': 0,
            'R-Thumb': 0, 'R-Index': 0, 'R-Middle': 0, 'R-Ring': 0, 'R-Pinky': 0,
        });
        fingertipHistory.current = {
            left: { thumb: [], index: [], middle: [], ring: [], pinky: [] },
            right: { thumb: [], index: [], middle: [], ring: [], pinky: [] },
        };
        // Randomize test sentence for new session
        setTargetText(TEST_SENTENCES[Math.floor(Math.random() * TEST_SENTENCES.length)]);
        containerRef.current?.focus();
    };

    const exportSessionData = () => {
        const sessionData = {
            metadata: {
                exportDate: new Date().toISOString(),
                testSentence: targetText,
                keyboardPreset: selectedKeyboard.name,
                actuationForce: selectedKeyboard.actuation,
            },
            summary: {
                wpm,
                accuracy,
                totalKeystrokes: totalKeystrokesTyped,
                totalErrors,
                durationMs: startTime ? Date.now() - startTime : 0,
                avgLeftWristDeviation: avgLeftWristAngle,
                avgRightWristDeviation: avgRightWristAngle,
                avgLeftPronation,
                avgRightPronation,
                avgLeftExtension,
                avgRightExtension,
                leftFingerTravel,
                rightFingerTravel,
                totalFingerTravel: leftFingerTravel + rightFingerTravel,
                cumulativeStrain: totalKeystrokesTyped * selectedKeyboard.actuation,
            },
            fingerUsage,
            keystrokes,
        };

        const blob = new Blob([JSON.stringify(sessionData, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `ergotype-session-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    };

    const renderText = () => {
        return targetText.split("").map((char, index) => {
            let className = "text-muted-foreground";

            if (index < userInput.length) {
                const keystroke = keystrokes[index];
                if (keystroke && keystroke.isCorrect) {
                    className = "text-green-600 dark:text-green-400";
                } else {
                    className = "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30";
                }
            } else if (index === userInput.length && index < targetText.length) {
                // Current cursor position 
                className = "text-foreground bg-yellow-200 dark:bg-yellow-500/30";
            }

            return (
                <span key={index} className={className}>
                    {char}
                </span>
            );
        });
    };

    const progressPercent = (userInput.length / targetText.length) * 100;
    const displayLeftWrist = isFinished && avgLeftWristAngle !== null ? avgLeftWristAngle : leftWristAngle;
    const displayRightWrist = isFinished && avgRightWristAngle !== null ? avgRightWristAngle : rightWristAngle;
    const displayLeftPronation = isFinished && avgLeftPronation !== null ? avgLeftPronation : leftPronation;
    const displayRightPronation = isFinished && avgRightPronation !== null ? avgRightPronation : rightPronation;
    const displayLeftExtension = isFinished && avgLeftExtension !== null ? avgLeftExtension : leftExtension;
    const displayRightExtension = isFinished && avgRightExtension !== null ? avgRightExtension : rightExtension;
    const actuationForce = selectedKeyboard.actuation;
    const cumulativeStrain = totalKeystrokesTyped * actuationForce;

    return (
        <TooltipProvider>
            {/* Load MediaPipe scripts */}
            <Script
                src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"
                strategy="afterInteractive"
            />
            <Script
                src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"
                strategy="afterInteractive"
                onLoad={() => setMediapipeLoaded(true)}
            />
            <Script
                src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js"
                strategy="afterInteractive"
            />

            {/* Reset Confirmation Dialog */}
            <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reset Test?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will clear all your progress and metrics. Are you sure you want to start over?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { handleReset(); setShowResetDialog(false); }}>
                            Reset
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Posture Recommendations Dialog */}
            <Dialog open={showRecommendations} onOpenChange={setShowRecommendations}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Posture Recommendations</DialogTitle>
                        <DialogDescription>
                            Based on your typing session, here are some tips to improve your ergonomics:
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-4">
                        {generateRecommendations(
                            avgLeftWristAngle,
                            avgRightWristAngle,
                            avgLeftPronation,
                            avgRightPronation,
                            avgLeftExtension,
                            avgRightExtension
                        ).map((tip, index) => (
                            <div key={index} className="flex gap-3 items-start">
                                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="text-xs font-medium text-primary">{index + 1}</span>
                                </div>
                                <p className="text-sm text-muted-foreground">{tip}</p>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end">
                        <Button onClick={() => setShowRecommendations(false)}>
                            Got it
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="min-h-screen bg-background p-6 md:p-8">
                <div className="mx-auto max-w-6xl space-y-6">

                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">ErgoType</h1>
                            <p className="text-sm text-muted-foreground">Ergonomic Typing Analysis</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Select
                                value={selectedKeyboard.id}
                                onValueChange={(id) => {
                                    const preset = KEYBOARD_PRESETS.find(p => p.id === id);
                                    if (preset) setSelectedKeyboard(preset);
                                }}
                            >
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select keyboard" />
                                </SelectTrigger>
                                <SelectContent>
                                    {KEYBOARD_PRESETS.map(preset => (
                                        <SelectItem key={preset.id} value={preset.id}>
                                            {preset.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                                className="h-8 w-8"
                            >
                                {mounted && (
                                    theme === "dark" ? (
                                        <Sun className="h-4 w-4" />
                                    ) : (
                                        <Moon className="h-4 w-4" />
                                    )
                                )}
                                <span className="sr-only">Toggle theme</span>
                            </Button>
                            <Button
                                variant={freeMode ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                    const newFreeMode = !freeMode;
                                    setFreeMode(newFreeMode);

                                    // If entering free mode after a test, reset to show real time values
                                    if (newFreeMode && isFinished) {
                                        setIsFinished(false);
                                        setAvgLeftWristAngle(null);
                                        setAvgRightWristAngle(null);
                                        setAvgLeftPronation(null);
                                        setAvgRightPronation(null);
                                        setAvgLeftExtension(null);
                                        setAvgRightExtension(null);
                                        setFingerUsage({
                                            'L-Pinky': 0, 'L-Ring': 0, 'L-Middle': 0, 'L-Index': 0, 'L-Thumb': 0,
                                            'R-Thumb': 0, 'R-Index': 0, 'R-Middle': 0, 'R-Ring': 0, 'R-Pinky': 0,
                                        });
                                        // Reset test active flag to prevent finger travel accumulation
                                        testActiveRef.current = false;
                                        setLeftFingerTravel(0);
                                        setRightFingerTravel(0);
                                    }
                                }}
                            >
                                {freeMode ? "Free Mode On" : "Free Mode"}
                            </Button>
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        Help
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                    <DialogHeader>
                                        <DialogTitle>How to Use ErgoType</DialogTitle>
                                        <DialogDescription>
                                            A tool for analyzing ergonomic typing posture
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 text-sm">
                                        <div>
                                            <h4 className="font-medium">Getting Started</h4>
                                            <p className="text-muted-foreground">
                                                1. Allow camera access for hand tracking<br />
                                                2. Position your hands over the keyboard<br />
                                                3. Click the typing area and start typing<br />
                                                4. Monitor your ergonomic metrics in real-time
                                            </p>
                                        </div>
                                        <div>
                                            <h4 className="font-medium">Understanding Metrics</h4>
                                            <p className="text-muted-foreground">
                                                <strong>Wrist Angle:</strong> Measures ulnar/radial deviation. Keep close to 0° to prevent strain.<br />
                                                <strong>Pronation:</strong> Palm rotation angle. 20-40° is natural and relaxed.<br />
                                                <strong>Finger Travel:</strong> Total finger movement. Lower values indicate more efficient typing.
                                            </p>
                                        </div>
                                        <div>
                                            <h4 className="font-medium">Keyboard Shortcuts</h4>
                                            <p className="text-muted-foreground">
                                                <strong>Esc:</strong> Reset the test
                                            </p>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>

                    {/* Side-by-side: Hand Tracking + Typing Test */}
                    <div className="grid gap-4 lg:grid-cols-5">
                        {/* Hand Tracking Card - 2 columns */}
                        <Card className="lg:col-span-2">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg">Hand Tracking</CardTitle>
                                    <Badge variant={handsDetected === 2 ? "default" : handsDetected === 1 ? "secondary" : "outline"}>
                                        {handsDetected === 2 ? "Both Hands" : handsDetected === 1 ? "1 Hand" : "No Hands"}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="relative w-full aspect-video bg-muted rounded-lg overflow-hidden">
                                    <video
                                        ref={videoRef}
                                        className="absolute top-0 left-0 w-full h-full object-cover hidden"
                                        playsInline
                                    />
                                    <canvas
                                        ref={canvasRef}
                                        width={1920}
                                        height={1080}
                                        className="absolute top-0 left-0 w-full h-full object-cover"
                                    />
                                    {cameraError && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-destructive/10">
                                            <div className="text-center space-y-2 p-4">
                                                <p className="text-sm font-medium text-destructive">Camera Error</p>
                                                <p className="text-xs text-muted-foreground">{cameraError}</p>
                                                <p className="text-xs text-muted-foreground">Hand tracking disabled</p>
                                            </div>
                                        </div>
                                    )}
                                    {!cameraActive && !cameraError && (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="text-center space-y-2">
                                                <div className="animate-pulse">
                                                    <p className="text-sm font-medium">
                                                        {!mediapipeLoaded ? "Loading..." : "Initializing..."}
                                                    </p>
                                                </div>
                                                <p className="text-xs text-muted-foreground">Allow camera access</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground text-center mt-2">
                                    Red: Right | Green: Left
                                </p>
                            </CardContent>
                        </Card>

                        {/* Typing Test Card - 3 columns */}
                        <Card
                            ref={containerRef}
                            tabIndex={0}
                            onKeyDown={handleKeyDown}
                            className="lg:col-span-3 focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-text"
                        >
                            <CardContent className="pt-6">
                                {/* Progress Bar */}
                                <div className="mb-4">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-muted-foreground">Progress</span>
                                        <span className="font-medium">{Math.round(progressPercent)}%</span>
                                    </div>
                                    <Progress value={progressPercent} className="h-2" />
                                </div>

                                {/* Status Message */}
                                <div className="mb-6 text-center min-h-[32px] space-y-2">
                                    {freeMode && !startTime && (
                                        <Badge variant="secondary" className="mb-2">
                                            Free Mode - View your hand posture in real-time
                                        </Badge>
                                    )}
                                    {!startTime && !isFinished && (
                                        <p className="text-muted-foreground">
                                            {freeMode ? "Start typing to begin test and exit Free Mode" : "Click here and start typing to begin"}
                                        </p>
                                    )}
                                    {isFinished && (
                                        <p className="text-xl font-semibold text-green-600">Test Complete!</p>
                                    )}
                                </div>

                                {/* Typing Text */}
                                <p className="text-xl leading-relaxed text-center font-mono select-none mb-6">
                                    {renderText()}
                                </p>

                                {/* Reset and Export Button */}
                                <div className="flex items-center justify-center gap-4">
                                    <Button variant="outline" onClick={() => setShowResetDialog(true)}>
                                        Reset Test
                                    </Button>
                                    {isFinished && (
                                        <Button variant="default" onClick={exportSessionData}>
                                            <Download className="w-4 h-4 mr-2" />
                                            Export Data
                                        </Button>
                                    )}
                                    <span className="text-xs text-muted-foreground">Press Esc to reset</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Finger Usage Heatmap */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">Finger Usage</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-10 gap-2">
                                {['L-Pinky', 'L-Ring', 'L-Middle', 'L-Index', 'L-Thumb',
                                    'R-Thumb', 'R-Index', 'R-Middle', 'R-Ring', 'R-Pinky'].map(finger => {
                                        const count = fingerUsage[finger] || 0;
                                        const total = Object.values(fingerUsage).reduce((a, b) => a + b, 0);
                                        const percent = total > 0 ? (count / total) * 100 : 0;
                                        const maxCount = Math.max(...Object.values(fingerUsage));

                                        // Gradient: grey (0%) to green (max usage)
                                        const intensity = maxCount > 0 ? count / maxCount : 0;

                                        return (
                                            <div
                                                key={finger}
                                                className="p-2 rounded-lg text-center border"
                                                style={{
                                                    backgroundColor: `rgba(34, 197, 94, ${intensity * 0.5})`,
                                                }}
                                            >
                                                <p className="text-xs font-medium truncate">{finger}</p>
                                                <p className="text-lg font-bold">{count}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {percent.toFixed(0)}%
                                                </p>
                                            </div>
                                        );
                                    })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Metrics Section */}
                    <div className={`grid gap-4 ${freeMode ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>

                        {/* Performance Card */}
                        {!freeMode && (
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-lg">Performance</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {/* Row 1: Speed, Accuracy, Finger Travel */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="p-2 rounded-lg bg-muted/50 text-center">
                                                    <p className="text-xs font-medium text-muted-foreground">Speed</p>
                                                    <p className="text-xl font-bold">{wpm}</p>
                                                    <p className="text-xs text-muted-foreground">WPM</p>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Words per minute. Average is 40 WPM.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="p-2 rounded-lg bg-muted/50 text-center">
                                                    <p className="text-xs font-medium text-muted-foreground">Accuracy</p>
                                                    <p className="text-xl font-bold">{accuracy}%</p>
                                                    <p className="text-xs text-muted-foreground">{totalErrors} errors</p>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Percentage of correct keystrokes. Aim for 95%+.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="p-2 rounded-lg bg-muted/50 text-center">
                                                    <p className="text-xs font-medium text-muted-foreground">Travel</p>
                                                    <p className="text-xl font-bold">{((leftFingerTravel + rightFingerTravel) * 100).toFixed(0)}</p>
                                                    <p className="text-xs text-muted-foreground">units</p>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Finger travel distance. Lower = more efficient.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>

                                    {/* Row 2: Keystrokes + Total Strain */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="p-2 rounded-lg bg-muted/50 text-center">
                                            <p className="text-xs font-medium text-muted-foreground">Keystrokes</p>
                                            <p className="text-xl font-bold">{totalKeystrokesTyped}</p>
                                        </div>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="p-2 rounded-lg bg-muted/50 text-center">
                                                    <p className="text-xs font-medium text-muted-foreground">Strain</p>
                                                    <p className="text-xl font-bold">{cumulativeStrain.toLocaleString()}g</p>
                                                    <p className="text-xs text-muted-foreground">{actuationForce}g/key</p>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Keystrokes × {actuationForce}g actuation. Compare keyboard types.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Left Hand Card */}
                        <Card>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg">Left Hand</CardTitle>
                                    {displayLeftWrist !== null && displayLeftPronation !== null && (
                                        <Badge variant={
                                            getWristStatus(displayLeftWrist)?.variant === "default" && getPronationStatus(displayLeftPronation)?.variant === "default"
                                                ? "default"
                                                : getWristStatus(displayLeftWrist)?.variant === "destructive" || getPronationStatus(displayLeftPronation)?.variant === "destructive"
                                                    ? "destructive"
                                                    : "secondary"
                                        }>
                                            {getWristStatus(displayLeftWrist)?.variant === "default" && getPronationStatus(displayLeftPronation)?.variant === "default"
                                                ? "Good"
                                                : getWristStatus(displayLeftWrist)?.variant === "destructive" || getPronationStatus(displayLeftPronation)?.variant === "destructive"
                                                    ? "Needs Attention"
                                                    : "Fair"}
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-3 gap-2">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="p-2 rounded-lg bg-muted/50 text-center">
                                                <p className="text-xs font-medium text-muted-foreground">Wrist</p>
                                                <p className="text-xl font-bold">
                                                    {displayLeftWrist !== null ? `${displayLeftWrist}°` : '--'}
                                                </p>
                                                {displayLeftWrist !== null && (
                                                    <Badge variant={getWristStatus(displayLeftWrist)!.variant} className="text-xs">
                                                        {getWristStatus(displayLeftWrist)!.label}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Ulnar/radial deviation. Keep close to 0°.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="p-2 rounded-lg bg-muted/50 text-center">
                                                <p className="text-xs font-medium text-muted-foreground">Pronation</p>
                                                <p className="text-xl font-bold">
                                                    {displayLeftPronation !== null ? `${displayLeftPronation}°` : '--'}
                                                </p>
                                                {displayLeftPronation !== null && (
                                                    <Badge variant={getPronationStatus(displayLeftPronation)!.variant} className="text-xs">
                                                        {getPronationStatus(displayLeftPronation)!.label}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Palm rotation. 20-40° is relaxed.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="p-2 rounded-lg bg-muted/50 text-center">
                                                <p className="text-xs font-medium text-muted-foreground">Extension</p>
                                                <p className="text-xl font-bold">
                                                    {displayLeftExtension !== null ? `${displayLeftExtension}°` : '--'}
                                                </p>
                                                {displayLeftExtension !== null && (
                                                    <Badge variant={getExtensionStatus(displayLeftExtension)!.variant} className="text-xs">
                                                        {getExtensionStatus(displayLeftExtension)!.label}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Wrist up/down bend. Keep close to 0°.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Right Hand Card */}
                        <Card>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg">Right Hand</CardTitle>
                                    {displayRightWrist !== null && displayRightPronation !== null && (
                                        <Badge variant={
                                            getWristStatus(displayRightWrist)?.variant === "default" && getPronationStatus(displayRightPronation)?.variant === "default"
                                                ? "default"
                                                : getWristStatus(displayRightWrist)?.variant === "destructive" || getPronationStatus(displayRightPronation)?.variant === "destructive"
                                                    ? "destructive"
                                                    : "secondary"
                                        }>
                                            {getWristStatus(displayRightWrist)?.variant === "default" && getPronationStatus(displayRightPronation)?.variant === "default"
                                                ? "Good"
                                                : getWristStatus(displayRightWrist)?.variant === "destructive" || getPronationStatus(displayRightPronation)?.variant === "destructive"
                                                    ? "Needs Attention"
                                                    : "Fair"}
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-3 gap-2">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="p-2 rounded-lg bg-muted/50 text-center">
                                                <p className="text-xs font-medium text-muted-foreground">Wrist</p>
                                                <p className="text-xl font-bold">
                                                    {displayRightWrist !== null ? `${displayRightWrist}°` : '--'}
                                                </p>
                                                {displayRightWrist !== null && (
                                                    <Badge variant={getWristStatus(displayRightWrist)!.variant} className="text-xs">
                                                        {getWristStatus(displayRightWrist)!.label}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Ulnar/radial deviation. Keep close to 0°.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="p-2 rounded-lg bg-muted/50 text-center">
                                                <p className="text-xs font-medium text-muted-foreground">Pronation</p>
                                                <p className="text-xl font-bold">
                                                    {displayRightPronation !== null ? `${displayRightPronation}°` : '--'}
                                                </p>
                                                {displayRightPronation !== null && (
                                                    <Badge variant={getPronationStatus(displayRightPronation)!.variant} className="text-xs">
                                                        {getPronationStatus(displayRightPronation)!.label}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Palm rotation. 20-40° is relaxed.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="p-2 rounded-lg bg-muted/50 text-center">
                                                <p className="text-xs font-medium text-muted-foreground">Extension</p>
                                                <p className="text-xl font-bold">
                                                    {displayRightExtension !== null ? `${displayRightExtension}°` : '--'}
                                                </p>
                                                {displayRightExtension !== null && (
                                                    <Badge variant={getExtensionStatus(displayRightExtension)!.variant} className="text-xs">
                                                        {getExtensionStatus(displayRightExtension)!.label}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Wrist up/down bend. Keep close to 0°.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                            </CardContent>
                        </Card>

                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}
