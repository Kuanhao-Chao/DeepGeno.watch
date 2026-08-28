# Keep model providers explicit and interchangeable

Summary generation targets a shared structured contract through both OpenAI and Anthropic adapters, while every run must name its provider and model and may not silently fail over. This adds configuration and adapter work, but prevents hidden model changes, preserves reproducibility, and avoids making the publication record dependent on one provider's response format.
