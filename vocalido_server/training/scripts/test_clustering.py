import numpy as np

gaps = np.array([80, 80, 80, 120, 80, 80, 80, 140, 80, 80, 80])

# Max-Gap (current broken logic)
max_gap = np.max(gaps)
min_gap = np.min(gaps)
if max_gap > min_gap * 1.1:
    threshold1 = max_gap - (max_gap - min_gap) * 0.2
else:
    threshold1 = 0
print(f"Max-Gap Threshold: {threshold1}")
print("Max-Gap Splitting:", gaps >= threshold1)

# K-Means (new logic)
c1, c2 = np.min(gaps), np.max(gaps)
for _ in range(5):
    cluster1 = gaps[np.abs(gaps - c1) <= np.abs(gaps - c2)]
    cluster2 = gaps[np.abs(gaps - c1) > np.abs(gaps - c2)]
    c1 = np.mean(cluster1) if len(cluster1) > 0 else c1
    c2 = np.mean(cluster2) if len(cluster2) > 0 else c2

if c2 > c1 * 1.15:
    threshold2 = (c1 + c2) / 2.0
else:
    threshold2 = 0
print(f"K-Means Threshold: {threshold2}")
print("K-Means Splitting:", gaps >= threshold2)
