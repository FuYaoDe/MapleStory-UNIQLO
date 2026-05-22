import React, { useEffect, useMemo, useRef, useState } from "react";

const modules = import.meta.glob("../extracted_components/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

const BOARD_UNITS = 1000;
const DEFAULT_ITEM_WIDTH = 160;

const initialAssets = Object.entries(modules)
  .map(([path, src]) => {
    const fileName = path.split("/").pop();
    const label = fileName.replace(/^\d+_/, "").replace(".png", "").replaceAll("_", " ");
    return {
      id: fileName.replace(".png", ""),
      fileName,
      label,
      src,
      aspect: 1,
    };
  })
  .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointerToBoard(event, boardElement) {
  const rect = boardElement.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * BOARD_UNITS,
    y: ((event.clientY - rect.top) / rect.height) * BOARD_UNITS,
    inside:
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom,
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export default function App() {
  const boardRef = useRef(null);
  const [assets, setAssets] = useState(initialAssets);
  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const [placedItems, setPlacedItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [interaction, setInteraction] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);

  useEffect(() => {
    let alive = true;

    Promise.all(
      initialAssets.map(
        (asset) =>
          new Promise((resolve) => {
            const image = new Image();
            image.onload = () =>
              resolve({
                ...asset,
                aspect: image.naturalWidth / image.naturalHeight,
              });
            image.onerror = () => resolve(asset);
            image.src = asset.src;
          }),
      ),
    ).then((loadedAssets) => {
      if (alive) {
        setAssets(loadedAssets);
      }
    });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!interaction) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      if (interaction.type === "palette") {
        const moved =
          Math.abs(event.clientX - interaction.startX) > 6 ||
          Math.abs(event.clientY - interaction.startY) > 6;
        if (moved && !interaction.hasMoved) {
          setInteraction({ ...interaction, hasMoved: true });
        }
        setDragPreview({ asset: interaction.asset, x: event.clientX, y: event.clientY });
        return;
      }

      const board = boardRef.current;
      if (!board) {
        return;
      }

      const point = pointerToBoard(event, board);

      if (interaction.type === "move") {
        setPlacedItems((items) =>
          items.map((item) =>
            item.id === interaction.itemId
              ? {
                  ...item,
                  x: point.x - interaction.offsetX,
                  y: point.y - interaction.offsetY,
                }
              : item,
          ),
        );
      }

      if (interaction.type === "resize") {
        setPlacedItems((items) =>
          items.map((item) => {
            if (item.id !== interaction.itemId) {
              return item;
            }

            const nextWidth = point.x - item.x;
            return {
              ...item,
              width: clamp(nextWidth, 40, 720),
            };
          }),
        );
      }
    };

    const handlePointerUp = (event) => {
      if (interaction.type === "palette" && boardRef.current) {
        const point = pointerToBoard(event, boardRef.current);
        if (point.inside) {
          addItem(interaction.asset, point.x, point.y);
        } else if (!interaction.hasMoved) {
          addItem(interaction.asset);
        }
      }
      setInteraction(null);
      setDragPreview(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [interaction, assetMap]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        removeSelected();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId]);

  function addItem(asset, boardX = BOARD_UNITS / 2, boardY = BOARD_UNITS / 2) {
    const id = `${asset.id}-${crypto.randomUUID()}`;
    const width = DEFAULT_ITEM_WIDTH;
    const height = width / asset.aspect;
    const item = {
      id,
      assetId: asset.id,
      x: boardX - width / 2,
      y: boardY - height / 2,
      width,
    };

    setPlacedItems((items) => [...items, item]);
    setSelectedId(id);
  }

  function beginPaletteDrag(event, asset) {
    event.preventDefault();
    setInteraction({
      type: "palette",
      asset,
      startX: event.clientX,
      startY: event.clientY,
      hasMoved: false,
    });
    setDragPreview({ asset, x: event.clientX, y: event.clientY });
  }

  function beginMove(event, item) {
    const board = boardRef.current;
    if (!board) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const point = pointerToBoard(event, board);
    setSelectedId(item.id);
    setInteraction({
      type: "move",
      itemId: item.id,
      offsetX: point.x - item.x,
      offsetY: point.y - item.y,
    });
  }

  function beginResize(event, item) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(item.id);
    setInteraction({ type: "resize", itemId: item.id });
  }

  function removeSelected() {
    setPlacedItems((items) => items.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }

  async function downloadJpg() {
    const canvas = document.createElement("canvas");
    const size = 1600;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);

    for (const item of placedItems) {
      const asset = assetMap.get(item.assetId);
      if (!asset) {
        continue;
      }

      const image = await loadImage(asset.src);
      const x = (item.x / BOARD_UNITS) * size;
      const y = (item.y / BOARD_UNITS) * size;
      const width = (item.width / BOARD_UNITS) * size;
      const height = width / asset.aspect;
      context.drawImage(image, x, y, width, height);
    }

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/jpeg", 0.95);
    link.download = "item-layout.jpg";
    link.click();
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>Item Composer</h1>
          <p>{assets.length} items · {placedItems.length} placed</p>
        </div>
        <div className="actions">
          <button type="button" onClick={removeSelected} disabled={!selectedId}>
            Remove
          </button>
          <button type="button" onClick={() => setPlacedItems([])} disabled={placedItems.length === 0}>
            Clear
          </button>
          <button type="button" className="primary" onClick={downloadJpg} disabled={placedItems.length === 0}>
            JPG
          </button>
        </div>
      </header>

      <section className="workspace" aria-label="Layout workspace">
        <div
          ref={boardRef}
          className="board"
          onPointerDown={() => setSelectedId(null)}
          aria-label="Square composition area"
        >
          {placedItems.map((item) => {
            const asset = assetMap.get(item.assetId);
            if (!asset) {
              return null;
            }

            const height = item.width / asset.aspect;
            const isSelected = selectedId === item.id;
            return (
              <div
                key={item.id}
                className={`placed-item ${isSelected ? "selected" : ""}`}
                style={{
                  left: `${(item.x / BOARD_UNITS) * 100}%`,
                  top: `${(item.y / BOARD_UNITS) * 100}%`,
                  width: `${(item.width / BOARD_UNITS) * 100}%`,
                  height: `${(height / BOARD_UNITS) * 100}%`,
                }}
                onPointerDown={(event) => beginMove(event, item)}
              >
                <img src={asset.src} alt="" draggable="false" />
                {isSelected && (
                  <>
                    <button
                      type="button"
                      className="item-remove"
                      aria-label="Remove selected item"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeSelected();
                      }}
                    >
                      ×
                    </button>
                    <span
                      className="resize-handle"
                      aria-hidden="true"
                      onPointerDown={(event) => beginResize(event, item)}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        <aside className="palette" aria-label="Item palette">
          {assets.map((asset) => (
            <button
              type="button"
              key={asset.id}
              className="asset-button"
              onPointerDown={(event) => beginPaletteDrag(event, asset)}
              title={asset.label}
            >
              <img src={asset.src} alt={asset.label} draggable="false" />
            </button>
          ))}
        </aside>
      </section>

      {dragPreview && (
        <div className="drag-preview" style={{ left: dragPreview.x, top: dragPreview.y }}>
          <img src={dragPreview.asset.src} alt="" />
        </div>
      )}
    </main>
  );
}
