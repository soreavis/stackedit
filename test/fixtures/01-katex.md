# KaTeX smoke test (0.16.11)

Paste this whole file into a new StackEdit doc. All formulas should render as math, not source text. No red error text in the preview.

## Inline math

Euler: $e^{i\pi} + 1 = 0$. Mass-energy: $E = mc^2$. Quadratic: $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$.

## Display math

Gaussian integral:

$$\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}$$

Basel problem:

$$\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}$$

## Matrix

$$
A = \begin{pmatrix}
1 & 2 & 3 \\
4 & 5 & 6 \\
7 & 8 & 9
\end{pmatrix}
$$

## Aligned

$$
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \cdot \mathbf{B} &= 0 \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t} \\
\nabla \times \mathbf{B} &= \mu_0 \mathbf{J} + \mu_0\varepsilon_0\frac{\partial \mathbf{E}}{\partial t}
\end{aligned}
$$

## Greek, sub/superscripts, arrows

$\alpha, \beta, \gamma, \delta, \Sigma, \Omega, \aleph_0$
$x_1^2 + x_2^2 \leq \sum_{i=1}^{n} x_i^2$
$A \xrightarrow{f} B \xleftarrow{g} C$

## Fractions + radicals

$$\sqrt[3]{\frac{a + b}{c - d}} = \frac{\sqrt[3]{a+b}}{\sqrt[3]{c-d}}$$

## Expected failure (bad LaTeX) — should render as red error text, not break the preview

$$\frac{1}{\undefined_command}$$
