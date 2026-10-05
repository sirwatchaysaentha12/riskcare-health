# PROJECT-ABSTRACT-EN.md — Abstract (English)

## A Prototype Three-Signal Respiratory Risk Assessment System with Measurement Quality Control and Transparent Evidence Reporting

**Problem**: People in high-PM2.5 areas lack accessible tools for basic respiratory-signal screening. Measuring respiratory rate and pulse requires medical devices or trained personnel, making it difficult to assemble structured information for medical professionals at household level.

**Approach**: We built a prototype that uses an existing camera to estimate three signals: (1) respiratory rate from shoulder motion via MediaPipe Pose, (2) heart rate from facial video via rPPG (VitalLens POS, on-device local mode), and (3) a self-observation questionnaire. Signals are combined with a transparent rule-based score (WHO/CDC-aligned thresholds). A **nine-part Quality Gate** refuses to produce a value when signal quality is insufficient (lighting, framing, blur, motion, frame rate, periodicity), instead of guessing.

**Transparency**: Every displayed value carries its source, algorithm version, measurement time/duration, quality status, and limitations. Clinical accuracy is fixed to `not-validated` until verified against reference devices. No raw video is stored; processing is on-device; consent is requested before the camera opens.

**Honest technical findings**: The signal-processing algorithm was evaluated on the BIDMC dataset (PhysioNet; 53 ICU records with manual breath annotations) in a signal-only track: **MAE 9.03 breaths/min (95% CI 8.49-9.54) with a systematic bias of +8.92 breaths/min** caused by cardiogenic artifacts on the impedance respiration signal. We report this negative result transparently — it demonstrates that naive peak counting does not transfer across modalities without re-validation, and establishes an evidence baseline for future research. The system also exhibits abstention behavior (42.4% of windows rejected on impedance signals), consistent with the "do not guess when uncertain" principle.

**Limitations**: This is a prototype — not a diagnostic tool. No clinical validation has been performed. No real-participant testing yet. SpO2 is unavailable in the local mode.

**Readiness**: Working demonstration (mock/synthetic data only) · 15+ governance/validation documents · Real-participant data collection has not started (awaiting professional review).
